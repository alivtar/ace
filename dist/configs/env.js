"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function checkRequiredEnvVariable(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env variable: ${key}`);
    }
    return value;
}
const config = {
    env: process.env.NODE_ENV,
    port: process.env.port ?? 5000,
    isProduction: process.env.NODE_ENV === 'production',
    DATABASE_URL: checkRequiredEnvVariable('DATABASE_URL'),
};
exports.default = config;
