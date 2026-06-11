import { db } from "../db.js";

export async function getModelUsage() {

    return db.collection("messages")
        .aggregate([
            {
                $match: {
                    model: {
                        $ne: null
                    }
                }
            },
            {
                $group: {
                    _id: "$model",
                    totalTokens: {
                        $sum: "$tokenCount"
                    }
                }
            },
            {
                $sort: {
                    totalTokens: -1
                }
            }
        ])
        .toArray();
}