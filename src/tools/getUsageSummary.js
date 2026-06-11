import { db } from "../db.js";

export async function getUsageSummary(period = "monthly") {

    const now = new Date();

    let startDate = new Date();

    switch (period) {

        case "daily":
            startDate.setDate(now.getDate() - 1);
            break;

        case "monthly":
            startDate.setMonth(now.getMonth() - 1);
            break;

        case "quarterly":
            startDate.setMonth(now.getMonth() - 3);
            break;

        case "yearly":
            startDate.setFullYear(now.getFullYear() - 1);
            break;
    }

    const messages = db.collection("messages");

    const stats = await messages.aggregate([
        {
            $match: {
                createdAt: {
                    $gte: startDate
                }
            }
        },
        {
            $group: {
                _id: null,
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
            $addFields: {
                userObjectIds: {
                    $map: {
                        input: "$users",
                        as: "u",
                        in: {
                            $convert: {
                                input: "$$u",
                                to: "objectId",
                                onError: null,
                                onNull: null
                            }
                        }
                    }
                }
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "userObjectIds",
                foreignField: "_id",
                as: "userDocs"
            }
        },
        {
            $project: {
                _id: 0,
                totalTokens: 1,
                totalMessages: 1,
                users: {
                    $map: {
                        input: "$users",
                        as: "uStr",
                        in: {
                            $let: {
                                vars: {
                                    matchedUser: {
                                        $filter: {
                                            input: "$userDocs",
                                            as: "ud",
                                            cond: {
                                                $eq: [
                                                    "$$ud._id",
                                                    {
                                                        $convert: {
                                                            input: "$$uStr",
                                                            to: "objectId",
                                                            onError: null,
                                                            onNull: null
                                                        }
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                },
                                in: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$$matchedUser.email", 0] },
                                        "Unknown User"
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        }
    ]).toArray();

    return stats[0];
}