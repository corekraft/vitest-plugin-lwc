import { registerSa11yMatcher } from '@sa11y/jest';

globalThis.vi = jest;

registerSa11yMatcher();
