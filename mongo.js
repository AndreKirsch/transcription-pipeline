const { MongoClient } = require("mongodb");

const config = require("./config");
const logger = require("./logger");
const { withRetry } = require("./retry");

let cachedClient = null;

async function getClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const client = new MongoClient(config.mongo.uri, {
    maxPoolSize: 5
  });

  await withRetry(() => client.connect(), {
    taskName: "mongo.connect",
    baseDelayMs: 1000
  });

  cachedClient = client;
  return cachedClient;
}

async function insertRecord(data) {
  logger.info({ source: data?.source }, "mongo insert invoked");

  const client = await getClient();
  const db = client.db(config.mongo.db);
  const result = await withRetry(() => db.collection(config.mongo.collection).insertOne(data), {
    taskName: "mongo.insert",
    baseDelayMs: 1000
  });

  logger.info({ id: result.insertedId }, "mongo insert successful");
  return result;
}

module.exports = { insertRecord };