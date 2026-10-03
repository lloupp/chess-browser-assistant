import ts from 'typescript-eslint';
export default ts.config({ignores:['dist/**','node_modules/**']}, ...ts.configs.recommended, {files:['src/**/*.ts'], rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]}});
