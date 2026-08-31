const lintStagedConfig = {
  "*.{js,cjs,mjs,ts,tsx,mts,cts}": [
    "eslint --max-warnings=0 --no-warn-ignored",
  ],
};

export default lintStagedConfig;
