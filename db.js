
const DB_NAME = "MukahtaeainInventory";
const DB_VERSION = 2;

const STORE_TRANSACTIONS = "pendingTransactions";
const STORE_PRODUCTS = "products";
const STORE_STOCK = "stockSnapshot";

function openInventoryDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        db.createObjectStore(STORE_TRANSACTIONS, {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS, {
          keyPath: "productId"
        });
      }

      if (!db.objectStoreNames.contains(STORE_STOCK)) {
        db.createObjectStore(STORE_STOCK, {
          keyPath: "productId"
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => db.close();

      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function runStoreTransaction(storeName, mode, action) {
  return openInventoryDB().then(db =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;

      try {
        result = action(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };

      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };

      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("Database transaction aborted"));
      };
    })
  );
}

function savePendingTransaction(transaction) {
  return runStoreTransaction(
    STORE_TRANSACTIONS,
    "readwrite",
    store => store.add({
      ...transaction,
      savedAt: new Date().toISOString(),
      syncStatus: "PENDING"
    })
  );
}

async function getPendingTransactions() {
  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRANSACTIONS, "readonly");
    const request = tx.objectStore(STORE_TRANSACTIONS).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function cacheProducts(products) {
  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTS, "readwrite");
    const store = tx.objectStore(STORE_PRODUCTS);

    for (const product of products) {
      const productId =
        product.ProductID ??
        product.productId ??
        product.id;

      if (productId === undefined || productId === null) {
        tx.abort();
        reject(new Error("Product ID မရှိပါ"));
        return;
      }

      store.put({
        ...product,
        productId: String(productId)
      });
    }

    tx.oncomplete = () => {
      db.close();
      resolve(products.length);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getCachedProducts() {
  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTS, "readonly");
    const request = tx.objectStore(STORE_PRODUCTS).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function cacheStockSnapshot(items) {
  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STOCK, "readwrite");
    const store = tx.objectStore(STORE_STOCK);

    for (const item of items) {
      const productId =
        item.ProductID ??
        item.productId ??
        item.id;

      if (productId === undefined || productId === null) {
        tx.abort();
        reject(new Error("Stock Product ID မရှိပါ"));
        return;
      }

      store.put({
        ...item,
        productId: String(productId),
        cachedAt: new Date().toISOString()
      });
    }

    tx.oncomplete = () => {
      db.close();
      resolve(items.length);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getCachedStockSnapshot() {
  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STOCK, "readonly");
    const request = tx.objectStore(STORE_STOCK).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}
