"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = __importDefault(require("./configs/env"));
const logger_1 = __importDefault(require("./configs/logger"));
app_1.default.listen(env_1.default.port, () => {
    logger_1.default.info(`App started on port ${env_1.default.port}`);
});
