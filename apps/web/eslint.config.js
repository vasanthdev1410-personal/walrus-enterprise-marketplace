import base from '@walrus/eslint-config';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  ...base,
  {
    plugins: { '@next/next': nextPlugin },
    rules: nextPlugin.configs['core-web-vitals'].rules,
  },
];
