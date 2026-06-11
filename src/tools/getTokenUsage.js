import { db } from "../db.js";

export async function getTokenUsage(period = "monthly") {

    const now = new Date();
    let groupBy;

    switch (period) {

        case "daily":
            groupBy = {
                $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt"
                }
            };
            break;

        case "monthly":
            groupBy = {
                $dateToString: {
                    format: "%Y-%m",
                    date: "$createdAt"
                }
            };
            break;

        case "quarterly":
            groupBy = {
                year: { $year: "$createdAt" },
                quarter: {
                    $ceil: {
                        $divide: [
                            { $month: "$createdAt" },
                            3
                        ]
                    }
                }
            };
            break;

        case "yearly":
            groupBy = {
                $year: "$createdAt"
            };
            break;

        default:
            throw new Error(
                "Period must be daily, monthly, quarterly or yearly"
            );
    }

    return db.collection("messages")
        .aggregate([
            {
                $group: {
                    _id: groupBy,
                    totalTokens: {
                        $sum: "$tokenCount"
                    },
                    totalMessages: {
                        $sum: 1
                    },
                    users: {
                        $addToSet: "$user"
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    totalTokens: 1,
                    totalMessages: 1,
                    activeUsers: {
                        $size: "$users"
                    }
                }
            },
            {
                $sort: {
                    "_id": 1
                }
            }
        ])
        .toArray();
}