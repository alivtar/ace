const pick = (object: Record<string, any>, keys: Array<string>) => {
  return keys.reduce<Record<string, any>>((obj, key) => {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      obj[key] = object[key];
    }
    return obj;
  }, {});
};

export default pick;
