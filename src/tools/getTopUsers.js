import { db } from "../db.js";

export async function getTopUsers(limit = 10) {

    return db.collection("messages")
        .aggregate([
            {
                $group: {
                    _id: "$user",
                    totalTokens: {
                        $sum: "$tokenCount"
                    },
                    messages: {
                        $sum: 1
                    }
                }
            },
            {
                $sort: {
                    totalTokens: -1
                }
            },
            {
                $limit: limit
            },
            {
                $addFields: {
                    userObjectId: {
                        $convert: {
                            input: "$_id",
                            to: "objectId",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userObjectId",
                    foreignField: "_id",
                    as: "userDoc"
                }
            },
            {
                $unwind: {
                    path: "$userDoc",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    email: { $ifNull: ["$userDoc.email", "Unknown User"] },
                    name: "$userDoc.name",
                    totalTokens: 1,
                    messageCount: "$messages"
                }
            }
        ])
        .toArray();
}