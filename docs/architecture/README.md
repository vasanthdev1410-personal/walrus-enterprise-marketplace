# Architecture

Module 00 establishes a pnpm/Turborepo monorepo with one Next.js application, one NestJS API,
and one Flutter application. Backend modules must use presentation, application, domain, and
infrastructure layers with dependencies pointing inward. No business module exists in Module 00.
