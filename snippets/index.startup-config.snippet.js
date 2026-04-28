// src/index.js elején, közvetlenül a dotenv.config() után:
const { validateEnv } = require('./config/env');
const env = validateEnv(process.env);

// ezután használd ezt:
const PORT = env.PORT;

// FONTOS:
// a validateEnv meghívása még azelőtt történjen meg,
// hogy betöltöd a DB configot vagy elindítod a szervert.
