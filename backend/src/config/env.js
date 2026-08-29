import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),
  REDIS_URL: z.string().refine(
    (url) => url.startsWith('redis://') || url.startsWith('rediss://'),
    { message: 'REDIS_URL must be a valid redis connection URL (redis:// or rediss://)' }
  ),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET must be at least 10 characters long'),
  JWT_REFRESH_SECRET: z.string().min(10, 'JWT_REFRESH_SECRET must be at least 10 characters long'),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required for AI features')
});

let env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Environment validation failed:');
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => {
      console.error(`   - ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    console.error(error);
  }
  process.exit(1);
}

export default env;
