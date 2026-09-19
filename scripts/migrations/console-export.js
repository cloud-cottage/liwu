// 在 CloudBase 控制台浏览器控制台中运行此脚本
// 会自动导出所有集合数据为 JSON 文件下载

(async () => {
  // 从 URL 获取 envId
  const envId = new URLSearchParams(location.search).get('envId') || 'liwu-0gtd91eebd863ccf';
  console.log('Env:', envId);

  // 使用页面内已有的 wxCloudClientSDK
  const collections = [
    'users','tag_categories','tags','user_tags','app_settings',
    'awareness_records','shop_categories','shop_products','shop_product_skus',
    'shop_orders','shop_order_items','partner_brands','partner_brand_members',
    'user_addresses','point_ledger','badge_profiles','user_profiles',
    'user_wallets','user_memberships','user_referrals',
    'user_partner_identities','user_operational_states'
  ];

  for (const name of collections) {
    try {
      // CloudBase Console 内部 API
      const resp = await fetch(`https://tcb-api.tencentcloudapi.com/admin?env=${envId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'database.queryDocument',
          collectionName: name,
          query: {},
          limit: 5000
        })
      });
      const data = await resp.json();
      const docs = data?.data?.list || data?.list || [];

      if (docs.length === 0) {
        console.log(`${name}: 0 docs (跳过)`);
        continue;
      }

      // 下载为 JSON
      const blob = new Blob([JSON.stringify(docs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      console.log(`${name}: ${docs.length} docs ✅`);
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {
      console.error(`${name}: ${e.message}`);
    }
  }
  console.log('Done!');
})();
