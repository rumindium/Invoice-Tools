import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackSource,
  type FeedbackStatus,
} from '../feedback-rules';

export class FeedbackInputDto {
  /** A saved customer; leave empty for someone who is not in master data yet. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerId?: string;

  @IsString()
  @MinLength(2, { message: 'Customer name must be at least 2 characters.' })
  @MaxLength(160)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsIn(FEEDBACK_SOURCES, { message: 'Choose where the feedback came from.' })
  source!: FeedbackSource;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceDetail?: string;

  @IsIn(FEEDBACK_CATEGORIES, { message: 'Choose the kind of feedback.' })
  category!: FeedbackCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Rating must be a whole number from 1 to 5.' })
  @Min(1, { message: 'Rating must be a whole number from 1 to 5.' })
  @Max(5, { message: 'Rating must be a whole number from 1 to 5.' })
  rating?: number;

  @IsString()
  @MinLength(3, { message: 'Subject must be at least 3 characters.' })
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(3, { message: 'Write down what the customer said.' })
  @MaxLength(4000)
  message!: string;

  @IsDateString({}, { message: 'Received date is not a valid date.' })
  receivedOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  relatedDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidence?: string;
}

export class FeedbackStatusDto {
  @IsIn(FEEDBACK_STATUSES, { message: 'Unsupported feedback status.' })
  status!: FeedbackStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

export class ListFeedbackQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['ALL', ...FEEDBACK_STATUSES, 'OPEN'])
  status?: FeedbackStatus | 'OPEN' | 'ALL';

  @IsOptional()
  @IsIn(['ALL', ...FEEDBACK_SOURCES])
  source?: FeedbackSource | 'ALL';

  @IsOptional()
  @IsIn(['ALL', ...FEEDBACK_CATEGORIES])
  category?: FeedbackCategory | 'ALL';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class RelatedDocumentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerId?: string;
}
