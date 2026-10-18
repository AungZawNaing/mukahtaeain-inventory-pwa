
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

/* =========================================
   OFFLINE TRANSACTION QUEUE HELPERS
   ========================================= */

// Queue ထဲရှိ မှတ်တမ်းတစ်ခု၏ အခြေအနေ ပြောင်းရန်
async function updatePendingTransaction(id, updates) {
  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRANSACTIONS, "readwrite");
    const store = tx.objectStore(STORE_TRANSACTIONS);
    const request = store.get(Number(id));

    request.onsuccess = () => {
      const record = request.result;

      if (!record) {
        tx.abort();
        return;
      }

      store.put({
        ...record,
        ...updates,
        id: record.id,
        updatedAt: new Date().toISOString()
      });
    };

    request.onerror = () => reject(request.error);

    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Queue update မအောင်မြင်ပါ"));
    };
  });
}

// Queue ထဲမှ မှတ်တမ်းတစ်ခုကို ဖျက်ရန်
// Sync အောင်မြင်ကြောင်း အတည်ပြုပြီးမှသာ အသုံးပြုပါ။
async function deletePendingTransaction(id) {
  return runStoreTransaction(
    STORE_TRANSACTIONS,
    "readwrite",
    store => store.delete(Number(id))
  );
}

// Sync မလုပ်ရသေးသော မှတ်တမ်းများကိုသာ ရယူရန်
async function getUnSyncedTransactions() {
  const transactions = await getPendingTransactions();

  return transactions
    .filter(item => item.syncStatus !== "SYNCED")
    .sort((a, b) => a.id - b.id);
}

// Queue ထဲရှိ စုစုပေါင်း မှတ်တမ်းအရေအတွက်
async function getPendingTransactionCount() {
  const transactions = await getPendingTransactions();
  return transactions.filter(
    item => item.syncStatus !== "SYNCED"
  ).length;
}

/*
 * Save an offline Stock OUT and adjust the local stock snapshot atomically.
 * This only changes this device's IndexedDB. It does NOT sync to Google Sheets.
 */
async function saveOfflineStockOut(transaction) {
  if (!transaction || !transaction.clientTxId || !transaction.productId) {
    throw new Error("Stock OUT မှတ်တမ်းအချက်အလက် မပြည့်စုံပါ");
  }

  const quantity = Number(transaction.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity ကို 0 ထက်ကြီးသော ကိန်းဂဏန်း ထည့်ပါ");
  }

  const db = await openInventoryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_TRANSACTIONS, STORE_STOCK],
      "readwrite"
    );
    const queueStore = tx.objectStore(STORE_TRANSACTIONS);
    const stockStore = tx.objectStore(STORE_STOCK);
    let result = null;
    let failed = false;

    const stockRequest = stockStore.get(String(transaction.productId));

    stockRequest.onsuccess = () => {
      const stock = stockRequest.result;

      if (!stock) {
        failed = true;
        tx.abort();
        reject(new Error("ဒီပစ္စည်း၏ လက်ကျန်ကို ဖုန်းထဲတွင် မတွေ့ပါ။ Online ဖြစ်ချိန် Sync လုပ်ပါ။"));
        return;
      }

      const currentStock = Number(
        stock.CurrentStock ?? stock.currentStock ?? stock.Stock ?? 0
      );

      if (!Number.isFinite(currentStock) || currentStock < quantity) {
        failed = true;
        tx.abort();
        reject(new Error("ဖုန်းထဲရှိ လက်ကျန် မလုံလောက်ပါ။ Internet ရှိချိန် Stock ကို Sync လုပ်ပါ။"));
        return;
      }

      const record = {
        ...transaction,
        quantity,
        savedAt: new Date().toISOString(),
        syncStatus: "PENDING",
        transactionType: "STOCK_OUT"
      };

      const addRequest = queueStore.add(record);
      addRequest.onsuccess = () => {
        stockStore.put({
          ...stock,
          productId: String(transaction.productId),
          CurrentStock: currentStock - quantity,
          cachedAt: new Date().toISOString(),
          localPendingAdjustment: true
        });
        result = {
          id: addRequest.result,
          currentStock,
          afterStock: currentStock - quantity
        };
      };
      addRequest.onerror = () => {
        failed = true;
        reject(addRequest.error || new Error("Pending Queue ထဲ သိမ်းမရပါ"));
      };
    };

    stockRequest.onerror = () => {
      failed = true;
      reject(stockRequest.error || new Error("Local Stock ကို ဖတ်မရပါ"));
    };

    tx.oncomplete = () => {
      db.close();
      if (!failed) resolve(result);
    };
    tx.onerror = () => {
      db.close();
      if (!failed) reject(tx.error || new Error("Offline Save မအောင်မြင်ပါ"));
    };
    tx.onabort = () => {
      db.close();
      if (!failed) reject(tx.error || new Error("Offline Save ပယ်ဖျက်ခံရပါသည်"));
    };
  });
}

