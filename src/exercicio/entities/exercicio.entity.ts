import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsInt, Min } from "class-validator";
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Categoria } from "../../categoria/entities/categoria.entity";


@Entity({ name: 'tb_exercicios' })
export class Exercicio {
  @PrimaryGeneratedColumn()
  @ApiProperty()
  id: number;

  @IsNotEmpty()
  @Column({ length: 255, nullable: false })
  @ApiProperty()
  nome: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  tempo: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  serie: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  repeticao: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  peso: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  descanso: number;

  @Column({ length: 5000 })
  @ApiProperty()
  foto: string;

  @ManyToOne(() => Categoria, (categoria) => categoria.exercicio, {
    onDelete: 'CASCADE',
  })
  @ApiProperty({ type: () => Categoria })
  categoria: Categoria;
}
