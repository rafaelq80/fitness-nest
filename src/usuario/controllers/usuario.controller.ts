import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';
import { Usuario } from '../entities/usuario.entity';
import { UsuarioService } from '../services/usuario.service';
import { DietaService } from '../services/dieta.service';

@Controller('/usuarios')
@ApiTags('Usuario')
@ApiBearerAuth()
export class UsuarioController {
  constructor(
    private readonly usuarioService: UsuarioService,
    private readonly dietaService: DietaService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('/all')
  @HttpCode(HttpStatus.OK)
  findAll(): Promise<Usuario[]> {
    return this.usuarioService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('/:id')
  @HttpCode(HttpStatus.OK)
  findById(@Param('id', ParseIntPipe) id: number): Promise<Usuario> {
    return this.usuarioService.findById(id);
  }

  @Post('/cadastrar')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() usuario: Usuario): Promise<Usuario> {
    return this.usuarioService.create(usuario);
  }

  @UseGuards(JwtAuthGuard)
  @Put('/atualizar')
  @HttpCode(HttpStatus.OK)
  async update(@Body() usuario: Usuario): Promise<Usuario> {
    return this.usuarioService.update(usuario);
  }

  @Get('gerardieta/:id')
  async gerarDieta(@Param('id', ParseIntPipe) id: number) {
    try {
      const planoAlimentar = await this.dietaService.gerarDieta(id);
      return planoAlimentar;
    } catch (error) {
      console.error('Erro: ', error);
      throw new HttpException('Erro ao gerar dieta', HttpStatus.BAD_REQUEST);
    }
  }
}
