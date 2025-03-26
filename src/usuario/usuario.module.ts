import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bcrypt } from '../auth/bcrypt/bcrypt';
import { UsuarioController } from './controllers/usuario.controller';
import { Usuario } from './entities/usuario.entity';
import { DietaService } from './services/dieta.service';
import { UsuarioService } from './services/usuario.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [UsuarioService, DietaService, Bcrypt],
  controllers: [UsuarioController],
  exports: [UsuarioService],
})
export class UsuarioModule {}
