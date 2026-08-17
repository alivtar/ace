"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pool_1 = __importDefault(require("../db/pool"));
const findUserByEmail = async (email) => {
    const result = await pool_1.default.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
};
const createUser = async (email, password) => {
    const result = await pool_1.default.query(`
            INSERT INTO users (email, password_hash)
            VALUES ($1, $2)
            RETURNING id, email, role, created_at, updated_at
        `, [email, password]);
    return result.rows[0];
};
const User = {
    findUserByEmail,
    createUser,
};
exports.default = User;
