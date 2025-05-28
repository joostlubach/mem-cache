module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          moduleResolution: 'Node',
        },
        isolatedModules: true
      }
    ],
  },
  testMatch: ['**/*.test.ts'],
  testEnvironment: 'node'
}