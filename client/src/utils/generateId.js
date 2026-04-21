export const generateId = (name) => {
  return name.replace(/\s+/g, "-") + "-" + Date.now();
};