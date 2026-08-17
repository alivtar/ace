"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = __importDefault(require("../../controllers/auth.controller"));
const authRouter = (0, express_1.Router)();
authRouter.post('/register', auth_controller_1.default.register);
authRouter.get('/', (req, res, next) => {
    try {
        res.status(200).json({ msg: 'Hello Auth.' });
        return;
    }
    catch (error) {
        next(error);
    }
});
exports.default = authRouter;
