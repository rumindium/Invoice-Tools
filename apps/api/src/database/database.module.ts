import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...databaseOptions(),
        autoLoadEntities: true,
        retryAttempts: 3,
        retryDelay: 2000,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
