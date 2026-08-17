const values = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string) { return values.get(key) ?? null; },
  async setItem(key: string, value: string) { values.set(key, value); },
  async removeItem(key: string) { values.delete(key); },
};

export default AsyncStorage;
