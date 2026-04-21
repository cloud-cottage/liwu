import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { brandCarouselSettingsService, shopService } from '../../services/cloudbase';
import carouselImageOne from '../../assets/home/carousel-1.svg';
import carouselImageTwo from '../../assets/home/carousel-2.svg';
import carouselImageThree from '../../assets/home/carousel-3.svg';
import carouselImageFour from '../../assets/home/carousel-4.svg';

const CAROUSEL_ITEMS = [
  {
    id: 'home_carousel_1',
    image: carouselImageOne,
    caption: '最珍贵的财富，是此刻内心的宁静。'
  },
  {
    id: 'home_carousel_2',
    image: carouselImageTwo,
    caption: '给生活一点留白，也给心一点回声。'
  },
  {
    id: 'home_carousel_3',
    image: carouselImageThree,
    caption: '每一次安住，都是与自己重新相认。'
  },
  {
    id: 'home_carousel_4',
    image: carouselImageFour,
    caption: '让呼吸轻轻落下，时间也会慢下来。'
  }
];

const SHOWCASE_REFRESH_INTERVAL_MS = 6500;

const shuffleArray = (items = [], seed = 0) => (
  [...items].sort((left, right) => {
    const leftWeight = `${left.id}_${seed}`.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
    const rightWeight = `${right.id}_${seed}`.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
    return leftWeight - rightWeight;
  })
);

const getShowcaseSpan = (aspectRatio = '1:1') => {
  if (aspectRatio === '2:3') {
    return { colSpan: 1, rowSpan: 2 };
  }

  if (aspectRatio === '16:9') {
    return { colSpan: 2, rowSpan: 1 };
  }

  return { colSpan: 1, rowSpan: 1 };
};

const canPlaceItem = (grid, startRow, startCol, colSpan, rowSpan) => {
  if (startRow + rowSpan > 4 || startCol + colSpan > 4) {
    return false;
  }

  for (let row = startRow; row < startRow + rowSpan; row += 1) {
    for (let col = startCol; col < startCol + colSpan; col += 1) {
      if (grid[row][col]) {
        return false;
      }
    }
  }

  return true;
};

const fillGrid = (grid, startRow, startCol, colSpan, rowSpan) => {
  for (let row = startRow; row < startRow + rowSpan; row += 1) {
    for (let col = startCol; col < startCol + colSpan; col += 1) {
      grid[row][col] = true;
    }
  }
};

const buildShowcaseLayout = (items = []) => {
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => false));
  const placements = [];

  items.forEach((item) => {
    const { colSpan, rowSpan } = getShowcaseSpan(item.aspectRatio);

    for (let row = 0; row < 4; row += 1) {
      let placed = false;

      for (let col = 0; col < 4; col += 1) {
        if (!canPlaceItem(grid, row, col, colSpan, rowSpan)) {
          continue;
        }

        fillGrid(grid, row, col, colSpan, rowSpan);
        placements.push({
          ...item,
          row,
          col,
          colSpan,
          rowSpan
        });
        placed = true;
        break;
      }

      if (placed) {
        break;
      }
    }
  });

  return placements;
};

const buildShowcaseItems = (products = []) => {
  const productShowcaseItems = products.flatMap((product) => {
    const explicitShowcaseItems = Array.isArray(product.showcaseMedia) ? product.showcaseMedia : [];
    const fallbackItems = explicitShowcaseItems.length > 0
      ? explicitShowcaseItems
      : (product.coverImage ? [{ id: `${product.id}_cover`, url: product.coverImage, aspectRatio: '1:1' }] : []);

    return fallbackItems
      .filter((item) => item?.url)
      .map((item, index) => ({
        id: item.id || `${product.id}_${index}`,
        productId: product.id,
        productName: product.name,
        image: item.url,
        aspectRatio: item.aspectRatio || '1:1'
      }));
  });

  return productShowcaseItems;
};

const Home = () => {
  const navigate = useNavigate();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselItems, setCarouselItems] = useState(CAROUSEL_ITEMS);
  const [showcaseItems, setShowcaseItems] = useState([]);
  const [showcaseSeed, setShowcaseSeed] = useState(0);
  const [showcaseFading, setShowcaseFading] = useState(false);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCarouselIndex((currentIndex) => (currentIndex + 1) % carouselItems.length);
    }, 4200);

    return () => window.clearInterval(timerId);
  }, [carouselItems.length]);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const [products, brandCarouselSettings] = await Promise.all([
        shopService.getProducts(),
        brandCarouselSettingsService.getSettings()
      ]);
      if (disposed) {
        return;
      }

      setShowcaseItems(buildShowcaseItems(products));
      setCarouselItems(CAROUSEL_ITEMS.map((fallbackItem, index) => ({
        ...fallbackItem,
        image: brandCarouselSettings.slides?.[index]?.imageUrl || fallbackItem.image,
        caption: brandCarouselSettings.slides?.[index]?.caption || fallbackItem.caption
      })));
    })();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setShowcaseFading(true);

      window.setTimeout(() => {
        setShowcaseSeed((currentSeed) => currentSeed + 1);
        setShowcaseFading(false);
      }, 280);
    }, SHOWCASE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, []);

  const currentCarouselItem = carouselItems[carouselIndex] || CAROUSEL_ITEMS[0];

  const showcaseLayout = useMemo(() => {
    const shuffledItems = shuffleArray(showcaseItems, showcaseSeed);
    return buildShowcaseLayout(shuffledItems);
  }, [showcaseItems, showcaseSeed]);

  return (
    <div className="page-container" style={{ padding: '20px' }}>
      <header style={{ marginBottom: '24px', marginTop: '20px' }}>
        <h1
          style={{
            fontSize: '28px',
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-text-primary)',
            margin: 0
          }}
        >
          理悟
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>礼敬物品，安住当下</p>
      </header>

      <section
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          marginBottom: '24px'
        }}
      >
        <img
          src={currentCarouselItem.image}
          alt="首页轮播图"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.28))'
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: '18px',
            bottom: '18px',
            maxWidth: '72%',
            padding: '10px 14px',
            borderRadius: '18px',
            backgroundColor: 'rgba(71, 85, 105, 0.54)',
            color: '#fff',
            fontSize: '14px',
            lineHeight: 1.6,
            backdropFilter: 'blur(8px)'
          }}
        >
          {currentCarouselItem.caption}
        </div>

        <div
          style={{
            position: 'absolute',
            right: '16px',
            bottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {carouselItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCarouselIndex(index)}
              aria-label={`切换到第 ${index + 1} 张轮播图`}
              style={{
                width: index === carouselIndex ? '22px' : '8px',
                height: '8px',
                borderRadius: '999px',
                border: 'none',
                backgroundColor: index === carouselIndex ? '#ffffff' : 'rgba(255, 255, 255, 0.56)',
                cursor: 'pointer',
                transition: 'all 0.24s ease'
              }}
            />
          ))}
        </div>
      </section>

      <section
        onClick={() => navigate('/meditation')}
        style={{
          height: '200px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          cursor: 'pointer',
          marginBottom: '24px'
        }}
      >
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-accent-clay)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          marginBottom: '10px'
        }}>
          ▶
        </div>
        <span style={{ fontWeight: '500' }}>开始今日冥想</span>
      </section>

      <section
        onClick={() => navigate('/s')}
        style={{
          backgroundColor: '#fff',
          borderRadius: '24px',
          padding: '18px',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontFamily: 'var(--font-serif)' }}>橱窗</h2>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>进入工坊</span>
        </div>

        <div
          style={{
            position: 'relative',
            aspectRatio: '1 / 1',
            borderRadius: '20px',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(143, 165, 138, 0.08), rgba(143, 165, 138, 0.18))',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
            gap: '8px',
            padding: '8px',
            opacity: showcaseFading ? 0.42 : 1,
            transition: 'opacity 0.38s ease'
          }}
        >
          {showcaseLayout.length > 0 ? showcaseLayout.map((item) => (
            <button
              key={`${item.id}_${showcaseSeed}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/s?product=${encodeURIComponent(item.productId)}`);
              }}
              style={{
                border: 'none',
                borderRadius: '16px',
                overflow: 'hidden',
                padding: 0,
                cursor: 'pointer',
                gridColumn: `${item.col + 1} / span ${item.colSpan}`,
                gridRow: `${item.row + 1} / span ${item.rowSpan}`,
                position: 'relative',
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)'
              }}
            >
              <img
                src={item.image}
                alt={item.productName}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.28) 100%)'
                }}
              />
            </button>
          )) : (
            <div
              style={{
                gridColumn: '1 / -1',
                gridRow: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: '13px'
              }}
            >
              橱窗图片设置后会在这里展示
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
