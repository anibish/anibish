import {defineConfig,globalIgnores} from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([...next,...ts,{rules:{'@typescript-eslint/no-unused-vars':'warn','react-hooks/set-state-in-effect':'off','react-hooks/static-components':'off','react-hooks/refs':'off','react-hooks/preserve-manual-memoization':'off'}},globalIgnores(['.next/**','node_modules/**','docs/**','storage/**'])]);
