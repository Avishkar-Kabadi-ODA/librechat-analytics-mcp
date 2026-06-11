import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();


const client = new MongoClient(process.env.MONGO_URI, {
    family: 4
});

export let db;

export async function connectDB() {
    await client.connect();
    db = client.db(process.env.DB_NAME);
}