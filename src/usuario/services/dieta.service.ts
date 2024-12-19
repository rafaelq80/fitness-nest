import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class DietaService {
  private readonly logger = new Logger(DietaService.name);
  private readonly GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Usuario)
    private usuarioRepository: Repository<Usuario>,
  ) {}

  async gerarDieta(id: number): Promise<{ refeicoes: any[]; totalCalorias: number }> {
    const usuario = await this.usuarioRepository.findOne({ where: { id } });
    
    if (!usuario) {
      throw new HttpException('Usuário não encontrado', HttpStatus.NOT_FOUND);
    }

    const prompt = this.criarPromptDieta(usuario);
    const resposta = await this.chamarGeminiAPI(prompt);

    return this.processarRespostaDieta(resposta);
  }

  private criarPromptDieta(usuario: Usuario): string {
    const idade = this.calcularIdade(usuario.dataNascimento);
    const peso = usuario.peso;
    const altura = usuario.altura;
    let objetivo: string;

    if (usuario.imc < 18.50) {
      objetivo = 'Ganho de peso saudável';
    } else if (usuario.imc < 24.90) {
      objetivo = 'Manter o peso saudável';
    } else if (usuario.imc < 29.90) {
      objetivo = 'Reduzir a gordura corporal';
    } else {
      objetivo = 'Perda de peso significativa';
    }

    return `Crie um plano alimentar detalhado para uma pessoa com as seguintes características: 
            Idade: ${idade} anos, Peso: ${peso.toFixed(2)} kg, Altura: ${altura.toFixed(2)} m, Objetivo: ${objetivo}. 
            O plano deve incluir obrigatoriamente 6 refeições (café da manhã, lanche matinal, almoço, lanche da tarde, jantar, ceia). 
            Para cada refeição, indique: nome do prato, ingredientes, modo de preparo e total de calorias. 
            Use linguagem clara e direta. Formate a resposta em JSON.`;
  }

  private async chamarGeminiAPI(prompt: string): Promise<string> {
    const API_KEY = this.configService.get<string>('API_KEY');
    
    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      };

      const response = await lastValueFrom(
        this.httpService.post(
          `${this.GEMINI_API_URL}key=${API_KEY}`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      //this.logger.log(response.data);

      if (!response.data.candidates || response.data.candidates.length === 0) {
        this.logger.warn('Nenhuma resposta válida recebida da API Gemini');
        throw new HttpException(
          'Sem respostas válidas',
          HttpStatus.NO_CONTENT,
        );
      }

      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      this.handleGeminiAPIError(error);
    }
  }

  private handleGeminiAPIError(error: any): never {
    this.logger.error('Erro na chamada da API Gemini', error);

    if (error.response) {
      // Erro com resposta do servidor
      throw new HttpException(
        error.response.data?.error || 'Erro na API Gemini',
        error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } else if (error.request) {
      // Erro sem resposta do servidor
      throw new HttpException(
        'Falha na comunicação com a API Gemini',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } else {
      // Outros erros
      throw new HttpException(
        'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private processarRespostaDieta(resposta: string): { refeicoes: any[]; totalCalorias: number } {
    try {
      const inicioJson = resposta.indexOf('{');
      const fimJson = resposta.lastIndexOf('}') + 1;
      const jsonPlano = resposta.substring(inicioJson, fimJson);

      const planoAlimentar = JSON.parse(jsonPlano).planoAlimentar.refeicoes;
      const refeicoes: any[] = [];
      let totalCalories = 0;

      const refeicoesEsperadas = [
        'Café da Manhã',
        'Lanche Matinal',
        'Almoço',
        'Lanche da Tarde',
        'Jantar',
        'Ceia',
      ];

      const refeicoesMap = new Map<string, any>();

      for (const refeicaoEsperada of refeicoesEsperadas) {
        let refeicaoEncontrada = false;

        for (const item of planoAlimentar) {
          if (item.nome === refeicaoEsperada) {
            const mealDetails = {
              nome: item.nome,
              prato: item.prato,
              ingredientes: Array.isArray(item.ingredientes)
                ? item.ingredientes
                : [item.ingredientes],
              modoPreparo: item.modoPreparo,
              calorias: parseFloat(
                item.calorias
                  .replace('Aproximadamente ', '')
                  .replace(' kcal', ''),
              ),
            };

            refeicoesMap.set(refeicaoEsperada, mealDetails);
            totalCalories += mealDetails.calorias;
            refeicaoEncontrada = true;
            break;
          }
        }

        if (!refeicaoEncontrada) {
          refeicoesMap.set(refeicaoEsperada, {
            nome: refeicaoEsperada,
            prato: 'Não informado',
            ingredientes: ['Não informado'],
            modoPreparo: 'Não informado',
            calorias: 0,
          });
        }
      }

      refeicoesEsperadas.forEach((refeicao) => {
        const refeicaoDetails = refeicoesMap.get(refeicao);
        if (refeicaoDetails) {
          refeicoes.push(refeicaoDetails);
        }
      });

      return {
        refeicoes,
        totalCalorias: totalCalories,
      };
    } catch (error) {
      this.logger.error('Erro ao processar resposta da dieta', error);
      throw new HttpException(
        'Falha ao processar resposta da dieta',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private calcularIdade(dataNascimento: Date): number {
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();

    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }

    return idade;
  }
}