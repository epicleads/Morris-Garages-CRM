import 'fastify';
import { AuthenticatedUser } from './user';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
    // Multipart plugin methods
    file?: () => Promise<{
      filename: string;
      encoding: string;
      mimetype: string;
      file: NodeJS.ReadableStream;
      fields: Record<string, any>;
      toBuffer: () => Promise<Buffer>;
    } | undefined>;
    files?: () => AsyncIterable<{
      filename: string;
      encoding: string;
      mimetype: string;
      file: NodeJS.ReadableStream;
      fields: Record<string, any>;
      toBuffer: () => Promise<Buffer>;
    }>;
  }
}

