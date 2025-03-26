import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bcrypt } from '../../auth/bcrypt/bcrypt';
import { Usuario } from '../entities/usuario.entity';

@Injectable()
export class UsuarioService {
  constructor(
    @InjectRepository(Usuario)
    private usuarioRepository: Repository<Usuario>,
    private bcrypt: Bcrypt,
  ) {}

  async findByUsuario(usuario: string): Promise<Usuario | undefined> {
    return await this.usuarioRepository.findOne({
      where: {
        usuario: usuario,
      },
    });
  }

  async findAll(): Promise<Usuario[]> {
    return await this.usuarioRepository.find();
  }

  async findById(id: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne({
      where: {
        id,
      },
    });

    if (!usuario)
      throw new HttpException('Usuario não encontrado!', HttpStatus.NOT_FOUND);

    return usuario;
  }

  async create(usuario: Usuario): Promise<Usuario> {
    const buscaUsuario = await this.findByUsuario(usuario.usuario);

    if (!buscaUsuario) {
      usuario.senha = await this.bcrypt.criptografarSenha(usuario.senha);
      usuario.imc = await this.calcularIMC(usuario.peso, usuario.altura);
      return await this.usuarioRepository.save(usuario);
    }

    throw new HttpException('O Usuario ja existe!', HttpStatus.BAD_REQUEST);
  }

  async update(usuario: Usuario): Promise<Usuario> {
    await this.findById(usuario.id);

    const buscaUsuario = await this.findByUsuario(usuario.usuario);

    if (buscaUsuario && buscaUsuario.id !== usuario.id)
      throw new HttpException(
        'Usuário (e-mail) já Cadastrado!',
        HttpStatus.BAD_REQUEST,
      );

    usuario.senha = await this.bcrypt.criptografarSenha(usuario.senha);
    usuario.imc = await this.calcularIMC(usuario.peso, usuario.altura);

    return await this.usuarioRepository.save(usuario);
  }

  async calcularIMC(peso: number, altura: number): Promise<number> {
    if (altura > 0) {
      return peso / (altura * altura);
    }

    return 0;
  }
}
