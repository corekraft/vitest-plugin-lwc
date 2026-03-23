const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');
const setupFilesAfterEnv = jestConfig.setupFilesAfterEnv || [];
setupFilesAfterEnv.push('<rootDir>/jest-sa11y-setup.js');
module.exports = {
    ...jestConfig,
    ...(process.env.JEST_CACHE_DIR
        ? { cacheDirectory: process.env.JEST_CACHE_DIR }
        : {}),
    // Watchman cannot create its state dir in some sandboxed environments; disable it to fall back to Node FS polling
    watchman: false,
    moduleNameMapper: {
        // Jest mocks
        '^@salesforce/apex$': '<rootDir>/force-app/test/jest-mocks/apex',
        '^@salesforce/schema$': '<rootDir>/force-app/test/jest-mocks/schema',
        '^lightning/navigation$':
            '<rootDir>/force-app/test/jest-mocks/lightning/navigation',
        '^lightning/platformShowToastEvent$':
            '<rootDir>/force-app/test/jest-mocks/lightning/platformShowToastEvent',
        '^lightning/uiRecordApi$':
            '<rootDir>/force-app/test/jest-mocks/lightning/uiRecordApi',
        '^lightning/messageService$':
            '<rootDir>/force-app/test/jest-mocks/lightning/messageService',
        '^lightning/actions$':
            '<rootDir>/force-app/test/jest-mocks/lightning/actions',
        '^lightning/modal$':
            '<rootDir>/force-app/test/jest-mocks/lightning/modal',
        '^lightning/refresh$':
            '<rootDir>/force-app/test/jest-mocks/lightning/refresh',
        '^lightning/logger$':
            '<rootDir>/force-app/test/jest-mocks/lightning/logger'
    },
    setupFiles: ['jest-canvas-mock'],
    setupFilesAfterEnv,
    testTimeout: 10000
};
