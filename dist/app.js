"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const v1_1 = __importDefault(require("./routes/v1"));
const error_1 = require("./middlewares/error");
const env_1 = __importDefault(require("./configs/env"));
const morgan_1 = __importDefault(require("./configs/morgan"));
const app = (0, express_1.default)();
if (env_1.default.env !== 'test') {
    app.use(morgan_1.default.successHandler);
    app.use(morgan_1.default.errorHandler);
}
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/v1', v1_1.default);
app.use(error_1.errorConverter);
app.use(error_1.errorHandler);
exports.default = app;
