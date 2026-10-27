#!/usr/bin/env node
import {requireNode24} from './node24.mjs';
import {deployOptions, runDeploy} from './deploy-prod-guards.mjs';

requireNode24();
try { console.log(JSON.stringify(runDeploy(deployOptions(process.argv.slice(2))), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
