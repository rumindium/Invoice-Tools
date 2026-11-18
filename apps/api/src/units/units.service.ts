import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UnitOfMeasure } from '../database/entities';
import { UnitInputDto } from './dto/unit.dto';

/** Units every workspace can bill in without adding them first. */
export const DEFAULT_UNITS = [
  'unit',
  'pcs',
  'set',
  'pack',
  'box',
  'kg',
  'gram',
  'liter',
  'meter',
  'hour',
  'day',
  'week',
  'month',
  'year',
];

export interface UnitView {
  id: string | null;
  name: string;
  isCustom: boolean;
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(UnitOfMeasure) private readonly units: Repository<UnitOfMeasure>,
    private readonly audit: AuditService,
  ) {}

  async list(workspaceId: string): Promise<UnitView[]> {
    const custom = await this.units.find({ where: { workspaceId }, order: { name: 'ASC' } });
    const builtIn: UnitView[] = DEFAULT_UNITS.map((name) => ({
      id: null,
      name,
      isCustom: false,
    }));
    const seen = new Set(DEFAULT_UNITS.map(key));

    return [
      ...builtIn,
      ...custom
        .filter((unit) => !seen.has(key(unit.name)))
        .map((unit) => ({ id: unit.id, name: unit.name, isCustom: true })),
    ];
  }

  async create(workspaceId: string, userId: string, dto: UnitInputDto): Promise<UnitView> {
    const name = dto.name.trim().replace(/\s+/g, ' ');

    if (!name) {
      throw new BadRequestException('Nama satuan wajib diisi.');
    }

    const builtIn = DEFAULT_UNITS.find((unit) => key(unit) === key(name));
    if (builtIn) {
      return { id: null, name: builtIn, isCustom: false };
    }

    const custom = await this.units.find({ where: { workspaceId } });
    const existing = custom.find((unit) => key(unit.name) === key(name));
    if (existing) {
      return { id: existing.id, name: existing.name, isCustom: true };
    }

    const saved = await this.units.save(this.units.create({ id: randomUUID(), workspaceId, name }));

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'unit.created',
      targetType: 'unit',
      targetId: saved.id,
      metadata: { name: saved.name },
    });

    return { id: saved.id, name: saved.name, isCustom: true };
  }

  async remove(workspaceId: string, userId: string, unitId: string): Promise<void> {
    const unit = await this.units.findOne({ where: { id: unitId, workspaceId } });

    if (!unit) {
      throw new NotFoundException('Satuan tidak ditemukan.');
    }

    await this.units.delete({ id: unit.id });

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'unit.removed',
      targetType: 'unit',
      targetId: unit.id,
      metadata: { name: unit.name },
    });
  }
}
