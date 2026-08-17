"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const env_1 = __importDefault(require("./env"));
const logger = (0, pino_1.default)(!env_1.default.isProduction
    ? {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
            },
        },
    }
    : undefined);
exports.default = logger;
