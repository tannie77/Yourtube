import { isDeepStrictEqual } from "node:util";

async function collectionNames(database) {
  const rows = await database.listCollections({}, { nameOnly: true }).toArray();
  return rows.map((row) => row.name).filter((name) => !name.startsWith("system.")).sort();
}

export async function databaseInventory(database) {
  const names = await collectionNames(database);
  return Promise.all(names.map(async (name) => ({
    name,
    documents: await database.collection(name).countDocuments({}),
  })));
}

function indexOptions(index) {
  const options = { name: index.name };
  for (const key of ["unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "collation", "hidden"]) {
    if (index[key] !== undefined) options[key] = index[key];
  }
  return options;
}

export async function copyDatabase(source, destination, onProgress = () => {}) {
  const sourceInventory = await databaseInventory(source);
  const destinationInventory = await databaseInventory(destination);
  const occupied = destinationInventory.filter((item) => item.documents > 0);
  if (occupied.length) {
    throw new Error(`Atlas database is not empty (${occupied.map((item) => item.name).join(", ")}). Migration stopped without overwriting it.`);
  }
  if (!sourceInventory.some((item) => item.documents > 0)) {
    throw new Error("The local source database has no records to copy.");
  }

  const existing = new Set(destinationInventory.map((item) => item.name));
  for (const item of sourceInventory) {
    const sourceCollection = source.collection(item.name);
    if (!existing.has(item.name)) await destination.createCollection(item.name);
    const targetCollection = destination.collection(item.name);
    for (const index of await sourceCollection.indexes()) {
      if (index.name !== "_id_") await targetCollection.createIndex(index.key, indexOptions(index));
    }
    let copied = 0;
    let batch = [];
    const cursor = sourceCollection.find({}).sort({ _id: 1 }).batchSize(100);
    for await (const document of cursor) {
      batch.push(document);
      if (batch.length === 100) {
        await targetCollection.insertMany(batch, { ordered: true });
        copied += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await targetCollection.insertMany(batch, { ordered: true });
      copied += batch.length;
    }
    if (copied !== item.documents) throw new Error(`Local ${item.name} changed during copying. Atlas may contain a partial copy; leave local data intact.`);
    onProgress({ name: item.name, documents: copied });
  }

  for (const item of sourceInventory) {
    const sourceCursor = source.collection(item.name).find({}).sort({ _id: 1 });
    const targetCursor = destination.collection(item.name).find({}).sort({ _id: 1 });
    for await (const sourceDocument of sourceCursor) {
      const targetDocument = await targetCursor.next();
      if (!isDeepStrictEqual(sourceDocument, targetDocument)) {
        throw new Error(`Verification failed for ${item.name}. Leave local data intact and inspect Atlas before retrying.`);
      }
    }
    if (await targetCursor.next()) throw new Error(`Atlas has extra records in ${item.name}. Leave local data intact.`);
  }
  return sourceInventory;
}
