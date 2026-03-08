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
    const resposta = await this.chamarGroqAPI(prompt);

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
Use linguagem clara e direta. Responda APENAS com JSON válido, sem texto adicional, no seguinte formato:
{
  "planoAlimentar": {
    "refeicoes": [
      {
        "nome": "Café da Manhã",
        "prato": "Nome do prato",
        "ingredientes": ["ingrediente 1", "ingrediente 2"],
        "modoPreparo": "Descrição do preparo",
        "calorias": 350
      }
    ]
  }
}`;
  }

  private definirObjetivo(imc: number): string {
    if (imc < 18.5) return 'Ganho de peso saudável';
    if (imc < 24.9) return 'Manter o peso saudável';
    if (imc < 29.9) return 'Reduzir a gordura corporal';
    return 'Perda de peso significativa';
  }

  private async chamarGroqAPI(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    const apiUrl = this.configService.get<string>('GROQ_API_URL');
    const model = this.configService.get<string>('GROQ_MODEL');

    if (!apiKey || !apiUrl) {
      this.logger.error('Configurações da API Groq não encontradas.');
      throw new HttpException('Configuração de API inválida.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post(
          apiUrl,
          {
            model: model || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new HttpException('Sem resposta válida da API Groq.', HttpStatus.NO_CONTENT);
      }

      return content;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Erro na chamada da API Groq', error?.response?.data ?? error.message);

      if (error.response) {
        throw new HttpException(
          error.response.data?.error?.message || 'Erro na API Groq',
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Falha na comunicação com a API Groq',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private processarRespostaDieta(resposta: string): { refeicoes: any[]; totalCalorias: number } {
    try {
      const planoAlimentar = JSON.parse(resposta).planoAlimentar.refeicoes;

      const refeicoes = planoAlimentar.map((item) => ({
        nome: item.nome,
        prato: item.prato || 'Não informado',
        ingredientes: Array.isArray(item.ingredientes) ? item.ingredientes : ['Não informado'],
        modoPreparo: item.modoPreparo || 'Não informado',
        calorias: typeof item.calorias === 'number'
          ? item.calorias
          : parseFloat(String(item.calorias).replace(/[^\d.]/g, '')) || 0,
      }));

      const totalCalorias = refeicoes.reduce((acc, curr) => acc + curr.calorias, 0);

      return { refeicoes, totalCalorias };
    } catch (error) {
      this.logger.error('Erro ao processar resposta da dieta', error);
      throw new HttpException('Falha ao processar resposta da dieta', HttpStatus.INTERNAL_SERVER_ERROR);
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