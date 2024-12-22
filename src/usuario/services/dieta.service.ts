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

    this.validarDadosUsuario(usuario);

    const prompt = this.criarPromptDieta(usuario);
    const resposta = await this.chamarGeminiAPI(prompt);

    return this.processarRespostaDieta(resposta);
  }

  private validarDadosUsuario(usuario: Usuario): void {
    if (!usuario.peso || !usuario.altura || !usuario.dataNascimento) {
      throw new HttpException(
        'Dados do usuário incompletos. Certifique-se de que peso, altura e data de nascimento estão preenchidos.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (usuario.peso <= 0 || usuario.altura <= 0) {
      throw new HttpException(
        'Peso e altura devem ser valores positivos.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private criarPromptDieta(usuario: Usuario): string {
    const idade = this.calcularIdade(usuario.dataNascimento);
    const objetivo = this.definirObjetivo(usuario.imc);

    return `Crie um plano alimentar detalhado para uma pessoa com as seguintes características: 
            Idade: ${idade} anos, Peso: ${usuario.peso.toFixed(2)} kg, Altura: ${usuario.altura.toFixed(2)} m, Objetivo: ${objetivo}. 
            O plano deve incluir obrigatoriamente 6 refeições (café da manhã, lanche matinal, almoço, lanche da tarde, jantar, ceia). 
            Para cada refeição, indique: nome do prato, ingredientes, modo de preparo e total de calorias. 
            Use linguagem clara e direta. Formate a resposta em JSON.`;
  }

  private definirObjetivo(imc: number): string {
    if (imc < 18.50) {
      return 'Ganho de peso saudável';
    } else if (imc < 24.90) {
      return 'Manter o peso saudável';
    } else if (imc < 29.90) {
      return 'Reduzir a gordura corporal';
    } else {
      return 'Perda de peso significativa';
    }
  }

  private async chamarGeminiAPI(prompt: string): Promise<string> {
    const API_KEY = this.configService.get<string>('API_KEY');
    if (!API_KEY) {
      this.logger.error('Chave da API Gemini não configurada.');
      throw new HttpException(
        'Configuração de API inválida.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`,
          requestBody,
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      if (!response.data.candidates || response.data.candidates.length === 0) {
        this.logger.warn('Nenhuma resposta válida recebida da API Gemini.');
        throw new HttpException('Sem respostas válidas', HttpStatus.NO_CONTENT);
      }

      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      this.handleGeminiAPIError(error);
    }
  }

  private handleGeminiAPIError(error: any): never {
    this.logger.error('Erro na chamada da API Gemini', error);

    if (error.response) {
      throw new HttpException(
        error.response.data?.error || 'Erro na API Gemini',
        error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } else if (error.request) {
      throw new HttpException(
        'Falha na comunicação com a API Gemini',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } else {
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
      const refeicoes = planoAlimentar.map((item) => ({
        nome: item.nome,
        prato: item.prato || 'Não informado',
        ingredientes: Array.isArray(item.ingredientes)
          ? item.ingredientes
          : ['Não informado'],
        modoPreparo: item.modoPreparo || 'Não informado',
        calorias: parseFloat(
          (item.calorias || '0')
            .replace('Aproximadamente ', '')
            .replace(' kcal', ''),
        ),
      }));

      const totalCalorias = refeicoes.reduce((acc, curr) => acc + (curr.calorias || 0), 0);

      return { refeicoes, totalCalorias };
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
