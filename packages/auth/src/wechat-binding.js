export const bindWechatToUser = async (db, collectionName, { userId, openId, unionId }) => {
  const updatePayload = { updated_at: new Date() };
  if (openId) updatePayload.wechat_open_id = openId;
  if (unionId) updatePayload.wechat_union_id = unionId;

  await db.collection(collectionName).doc(userId).update(updatePayload);
};

export const resolveUserByWechatOpenId = async (db, collectionName, openId) => {
  if (!openId) return null;
  const result = await db.collection(collectionName).where({ wechat_open_id: openId }).limit(1).get();
  const docs = result.data || [];
  return docs[0] || null;
};
