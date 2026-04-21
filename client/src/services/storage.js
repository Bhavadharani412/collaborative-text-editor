export const getDocs = () => {
  try {
    const docs = JSON.parse(localStorage.getItem("docs") || "[]");
    return docs.filter(d => d.id && d.name);
  } catch {
    return [];
  }
};

export const saveDocs = (docs) => {
  localStorage.setItem("docs", JSON.stringify(docs));
};