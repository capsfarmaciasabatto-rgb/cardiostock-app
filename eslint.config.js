import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**/*']
  },
  {
    files: ['**/*.rules'],
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin
    },
    languageOptions: {
      parser: firebaseRulesPlugin.parsers.firestore,
    },
    rules: {
      ...firebaseRulesPlugin.configs['flat/recommended'].rules,
    },
  }
);
