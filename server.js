const express = require('express');
const path = require('path');
const { ZingMp3 } = require('./dist');

const app = express();
const PORT = process.env.PORT || 5555;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// health
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// basic demos
app.get('/api/top100', async (_req, res) => {
  try {
    const data = await ZingMp3.getTop100();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/home', async (_req, res) => {
  try {
    const data = await ZingMp3.getHome();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// full list according to README
app.get('/api/song', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getSong(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// redirect to stream URL for simple playback (avoid CORS)
app.get('/api/song/stream', async (req, res) => {
  try {
    const { id, quality = '128' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const response = await ZingMp3.getSong(String(id));
    const url = response?.data?.[String(quality)];
    if (!url || typeof url !== 'string') {
      return res.status(404).json({ error: `Stream URL not found for quality ${quality}` });
    }
    res.redirect(url);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/detail-playlist', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getDetailPlaylist(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/chart-home', async (_req, res) => {
  try {
    const data = await ZingMp3.getChartHome();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/newrelease-chart', async (_req, res) => {
  try {
    const data = await ZingMp3.getNewReleaseChart();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/info-song', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getInfoSong(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/artist', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const data = await ZingMp3.getArtist(String(name));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/artist-songs', async (req, res) => {
  try {
    const { id, page = '1', count = '15' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getListArtistSong(String(id), String(page), String(count));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/lyric', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getLyric(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const count = Math.min(Math.max(parseInt(req.query.count || req.query.limit, 10) || 15, 1), 50);

    if (!q) {
      return res.status(400).json({ err: 1, msg: 'Missing q', data: null });
    }

    // Ưu tiên endpoint tìm kiếm bài hát có phân trang.
    let response;
    if (typeof ZingMp3.searchAll === 'function') {
      response = await ZingMp3.searchAll(q, String(page), String(count));
    }

    const payload = response?.data || {};
    let rawSongs = [
      payload.songs,
      payload.items,
      payload.data?.songs,
      payload.data?.items
    ].find(Array.isArray);

    // Một số phiên bản API trả cấu trúc tìm kiếm multi thay vì danh sách song.
    if (!rawSongs) {
      const fallback = await ZingMp3.search(q);
      const fallbackSongs = fallback?.data?.songs;
      if (Array.isArray(fallbackSongs)) {
        rawSongs = fallbackSongs;
        response = fallback;
      } else {
        return res.json({
          err: response?.err ?? fallback?.err ?? 0,
          msg: response?.msg || fallback?.msg || 'Success',
          data: {
            total: Number(payload.total) || 0,
            hasMore: Boolean(payload.hasMore),
            page,
            count,
            songs: [],
            warning: 'API có trả metadata nhưng không tìm thấy mảng songs/items.',
            responseKeys: Object.keys(payload)
          }
        });
      }
    }

    const seen = new Set();
    const songs = rawSongs
      .filter(song => {
        const id = song?.encodeId || song?.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(song => ({
        encodeId: song.encodeId || song.id,
        title: song.title || song.name || '',
        artistsNames: song.artistsNames || song.artistNames || '',
        duration: song.duration || 0,
        thumbnail: song.thumbnail || song.thumbnailM || song.thumbnail_medium || '',
        thumbnailM: song.thumbnailM || song.thumbnail || '',
        album: song.album || null,
        isWorldWide: song.isWorldWide
      }))
      .slice(0, count);

    res.json({
      err: response?.err ?? 0,
      msg: response?.msg || 'Success',
      data: {
        total: Number(payload.total) || songs.length,
        hasMore: typeof payload.hasMore === 'boolean'
          ? payload.hasMore
          : songs.length === count,
        page,
        count,
        songs
      }
    });
  } catch (e) {
    console.error('Search error:', e);
    res.status(e?.response?.status || 500).json({
      err: 1,
      error: e?.message || 'Internal Error'
    });
  }
});

app.get('/api/list-mv', async (req, res) => {
  try {
    const { id, page = '1', count = '15' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getListMV(String(id), String(page), String(count));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/category-mv', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getCategoryMV(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/video', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getVideo(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
