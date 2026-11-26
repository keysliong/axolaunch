// Приколюхи: сплэши, питомец-аксолотль, конами-код, конфетти, достижения, генератор имён
import { esc, sound, toast, call, t } from './ui.js'
import { pick } from './i18n.js'

const SPLASHES_RU = [
  'Теперь с аксолотлями!', 'Не копай вниз!', '100% без крипперов*', 'Сделано из блоков!', 'Также попробуйте Terraria!',
  'Крафтим с 2009 года', 'Шейдеры не включены', 'Плюс один FPS!', 'Ещё один мод — и всё', 'Привет, Хиробрин!',
  'Java Edition!', 'Аксолотли — лучшие питомцы', 'Сохраняйся почаще!', 'Ctrl+C, Ctrl+Mod', 'Опять 4096 МБ RAM?',
  'Без регистрации и СМС', 'Майнкрафт — это жизнь', 'Fabric или Forge?', 'Quilt тоже ничего', 'Тот самый лаунчер!',
  'Синий аксолотль 1 к 1200!', 'Где алмазы, Карл?', 'Ночь — время монстров', 'Незер ждёт!', 'Дракон Края боится тебя',
  'Теперь в 4K (нет)', 'Попробуй конами-код ;)', 'Пиксели не настоящие', 'Коровы дают молоко', 'mrpack — это любовь',
  'Модринт ♥', 'Кубические сны', 'Работает на чистом энтузиазме', 'Загрузка чанков…', 'Ссссс… БУМ!', 'Зелёный — тоже аксолотль!',
]
const SPLASHES_EN = [
  'Now with axolotls!', "Don't dig straight down!", '100% creeper-free*', 'Made of blocks!', 'Also try Terraria!',
  'Crafting since 2009', 'Shaders not included', 'Plus one FPS!', 'Just one more mod', 'Hi, Herobrine!',
  'Java Edition!', 'Axolotls are the best pets', 'Save often!', 'Ctrl+C, Ctrl+Mod', '4096 MB of RAM again?',
  'No sign-up required', 'Minecraft is life', 'Fabric or Forge?', 'Quilt is nice too', 'The launcher!',
  'Blue axolotl: 1 in 1200!', 'Where are the diamonds?', 'Night is monster time', 'The Nether awaits!', 'The Ender Dragon fears you',
  'Now in 4K (not really)', 'Try the Konami code ;)', 'Pixels are not real', 'Cows give milk', 'mrpack is love',
  'Modrinth ♥', 'Cubic dreams', 'Powered by pure enthusiasm', 'Loading chunks…', 'Ssss… BOOM!', 'Green axolotls are real!',
]
export const splashes = () => pick(SPLASHES_RU, SPLASHES_EN)

const TIPS_RU = [
  'Перетащите <b>.mrpack</b> или <b>.jar</b> прямо в окно лаунчера — он сам поймёт, что делать.',
  'Нажмите <b>правой кнопкой</b> по сборке, чтобы быстро открыть папку, дублировать или экспортировать её.',
  'В настройках можно поставить <b>свой фон</b> и даже написать <b>свой CSS</b>.',
  'Кнопка <b>«Мне повезёт»</b> в каталоге покажет случайный проект с Modrinth.',
  'Кликайте по аксолотлю слева — он любит внимание.',
  'Экспорт в <b>.mrpack</b> автоматически находит моды на Modrinth, чтобы файл был лёгким.',
  'Во вкладке «Контент» есть кнопка <b>«Проверить обновления»</b> — обновит все моды разом.',
  'Для каждой сборки можно задать свою <b>Java, память и аргументы JVM</b>.',
  'Нажмите <kbd>Ctrl</kbd>+<kbd>K</kbd> для быстрого поиска модов.',
  'Попробуйте ввести одну старую секретную комбинацию стрелками… ↑↑↓↓',
  'Язык интерфейса можно сменить в <b>Настройки → Внешний вид</b>.',
]
const TIPS_EN = [
  'Drop a <b>.mrpack</b> or <b>.jar</b> right onto the launcher window — it knows what to do.',
  '<b>Right-click</b> an instance to open its folder, duplicate or export it.',
  'In settings you can set <b>your own background</b> and even write <b>custom CSS</b>.',
  'The <b>“I’m feeling lucky”</b> button in Discover shows a random Modrinth project.',
  'Click the axolotl on the left — it loves attention.',
  'Exporting to <b>.mrpack</b> automatically finds mods on Modrinth to keep the file small.',
  'The Content tab has a <b>“Check for updates”</b> button that updates every mod at once.',
  'Every instance can have its own <b>Java, memory and JVM arguments</b>.',
  'Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to quickly search for mods.',
  'Try entering a certain old secret combo with the arrow keys… ↑↑↓↓',
  'You can change the interface language in <b>Settings → Appearance</b>.',
]
export const tips = () => pick(TIPS_RU, TIPS_EN)

const NAMES = {
  ru: {
    adj: ['Хитрый', 'Сонный', 'Алмазный', 'Пиксельный', 'Ржавый', 'Космический', 'Ламповый', 'Дикий', 'Уютный', 'Тайный', 'Огненный', 'Ледяной', 'Древний', 'Весёлый', 'Хмурый', 'Мшистый', 'Золотой', 'Незерский'],
    noun: ['Криппер', 'Аксолотль', 'Голем', 'Эндермен', 'Зомби', 'Шалкер', 'Житель', 'Слайм', 'Блейз', 'Вардэн', 'Ифрит', 'Кролик', 'Лис', 'Панда', 'Скелет', 'Дракон', 'Гаст'],
    suf: ['', '', '', ' 2.0', ' Remastered', ' на минималках', ' Deluxe', ' Edition', ' и друзья', ' PRO MAX'],
  },
  en: {
    adj: ['Sneaky', 'Sleepy', 'Diamond', 'Pixel', 'Rusty', 'Cosmic', 'Cozy', 'Wild', 'Snug', 'Secret', 'Fiery', 'Frozen', 'Ancient', 'Jolly', 'Grumpy', 'Mossy', 'Golden', 'Nether'],
    noun: ['Creeper', 'Axolotl', 'Golem', 'Enderman', 'Zombie', 'Shulker', 'Villager', 'Slime', 'Blaze', 'Warden', 'Rabbit', 'Fox', 'Panda', 'Skeleton', 'Dragon', 'Ghast', 'Frog'],
    suf: ['', '', '', ' 2.0', ' Remastered', ' Lite', ' Deluxe', ' Edition', ' & Friends', ' PRO MAX'],
  },
}
export function randomName() {
  const r = a => a[Math.floor(Math.random() * a.length)]
  const n = pick(NAMES.ru, NAMES.en)
  return `${r(n.adj)} ${r(n.noun)}${r(n.suf)}`
}

// i — иконка, c — цвет плашки
const ACH = {
  first_launch: { i: 'rocket', c: '#ff7ab8', t: ['Поехали!', 'Here we go!'], d: ['Запустить игру в первый раз', 'Launch the game for the first time'] },
  night_owl: { i: 'moon', c: '#8ab4ff', t: ['Ночная сова', 'Night owl'], d: ['Запустить игру между полуночью и пятью утра', 'Launch the game between midnight and 5 AM'] },
  marathon: { i: 'timer', c: '#ffc04d', t: ['Марафонец', 'Marathon'], d: ['Играть больше двух часов за сессию', 'Play for more than two hours in one session'] },
  crash: { i: 'bomb', c: '#ff5c6c', t: ['Ой, всё', 'Oops'], d: ['Игра вылетела. Бывает!', 'The game crashed. It happens!'] },
  modder: { i: 'puzzle', c: '#1bd96a', t: ['Моддер', 'Modder'], d: ['Установить 10 модов', 'Install 10 mods'] },
  hoarder: { i: 'crown', c: '#ffd54a', t: ['Дракон на золоте', 'Dragon hoard'], d: ['Установить 100 модов', 'Install 100 mods'] },
  exporter: { i: 'package', c: '#c58bff', t: ['Упаковщик', 'Packer'], d: ['Экспортировать сборку в .mrpack', 'Export an instance to .mrpack'] },
  packer: { i: 'gift', c: '#ff6a2b', t: ['Распаковка', 'Unboxing'], d: ['Установить готовую сборку', 'Install a modpack'] },
  collector: { i: 'library', c: '#2bd4e0', t: ['Коллекционер', 'Collector'], d: ['Создать 5 сборок', 'Create 5 instances'] },
  konami: { i: 'gamepad', c: '#ff7ab8', t: ['↑↑↓↓←→←→BA', '↑↑↓↓←→←→BA'], d: ['Ввести конами-код', 'Enter the Konami code'] },
  blue_axolotl: { i: 'heartFill', c: '#5b6ee8', t: ['Один на 1200', 'One in 1200'], d: ['Встретить синего аксолотля', 'Meet the blue axolotl'] },
  pet_lover: { i: 'heartFill', c: '#ff9ccf', t: ['Лучший друг', 'Best friend'], d: ['Погладить аксолотля 50 раз', 'Pet the axolotl 50 times'] },
  stylist: { i: 'palette', c: '#c58bff', t: ['Стилист', 'Stylist'], d: ['Сменить тему оформления', 'Change the theme'] },
  lucky: { i: 'clover', c: '#8fdc5a', t: ['Мне повезёт', 'Feeling lucky'], d: ['Нажать «Мне повезёт» в каталоге', 'Press “I’m feeling lucky” in Discover'] },
  herobrine: { i: 'eye', c: '#e8e8e8', t: ['Он здесь', 'He is here'], d: ['Назвать сборку именем Herobrine', 'Name an instance Herobrine'] },
  css_hacker: { i: 'code', c: '#33ff33', t: ['Хакер', 'Hacker'], d: ['Написать свой CSS', 'Write custom CSS'] },
}
/** Достижения с текстами на текущем языке */
export function achievements() {
  return Object.fromEntries(Object.entries(ACH).map(([k, a]) => [k, { i: a.i, c: a.c, t: pick(a.t[0], a.t[1]), d: pick(a.d[0], a.d[1]) }]))
}
export const ACHIEVEMENT_KEYS = Object.keys(ACH)

export function unlock(key) { call('stats:unlock', key).catch(() => {}) }
export function showAchievement(key) {
  const a = achievements()[key]
  if (!a) return
  toast(t('Достижение: {name}', { name: a.t }), a.d, 'ach', a.i)
}

// ---------- пиксельный аксолотль ----------
const GRID = [
  '................', '.G............G.', '..G.PPPPPPPP.G..', 'GG.PPPPPPPPPP.GG', '..GPPPPPPPPPPG..',
  'GGPPPPPPPPPPPPGG', '..PPWEPPPPWEPP..', 'GPPPEEPPPPEEPPPG', '..PPPPPPPPPPPP..', '..PDPPMPPMPPDP..',
  '..PPPPPMMPPPPP..', '...PPPPPPPPPP...', '....PPPPPPPP....', '....PP....PP....', '................', '................',
]
const COLORS = {
  pink: { name: ['Розовый', 'Pink'], P: '#ff9ccf', D: '#ff66aa', G: '#d6337f', M: '#b8326e' },
  brown: { name: ['Дикий', 'Wild'], P: '#8d6e52', D: '#a77d5b', G: '#5e4330', M: '#3f2c1f' },
  gold: { name: ['Золотой', 'Gold'], P: '#ffd25e', D: '#ffb53b', G: '#e08a1e', M: '#a8601a' },
  cyan: { name: ['Голубой', 'Cyan'], P: '#bdeefa', D: '#8fdcf0', G: '#d6337f', M: '#9a3d72' },
  green: { name: ['Зелёный', 'Green'], P: '#7fdc6a', D: '#5cc24a', G: '#2f8f3a', M: '#1f5e27' },
  blue: { name: ['Синий (редкий!)', 'Blue (rare!)'], P: '#5b6ee8', D: '#7686f0', G: '#3a48b8', M: '#26318a' },
}
export const PET_COLORS = COLORS
export const petName = k => { const n = COLORS[k]?.name; return n ? pick(n[0], n[1]) : k }
const COMMON = ['pink', 'brown', 'gold', 'cyan', 'green']

export function axolotlSVG(color = 'pink', blink = false) {
  const c = COLORS[color] || COLORS.pink
  const pal = { ...c, E: blink ? c.P : '#2a1a2e', W: blink ? c.P : '#ffffff' }
  let rects = ''
  GRID.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[ch]}"/>` }))
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
}

const PET_LINES_RU = [
  'Бульк!', 'Погладь меня ещё!', 'Я не рыба, я амфибия!', 'Пойдём строить замок?', 'Ты сегодня отлично выглядишь!',
  'Я регенерирую лапки, а ты?', 'Хочу тропическую рыбку', 'Только не в ведро!', 'Скучно… давай поставим мод?',
  'Я охраняю твои сохранения', '*довольно булькает*', 'Mojang, добавьте шляпы аксолотлям', 'Ты знал, что я умею притворяться мёртвым?',
]
const PET_LINES_EN = [
  'Blub!', 'Pet me more!', "I'm not a fish, I'm an amphibian!", 'Shall we build a castle?', 'You look great today!',
  'I can regrow my legs, can you?', 'I want a tropical fish', 'Not the bucket!', 'Bored… shall we install a mod?',
  "I'm guarding your saves", '*happy blubbing*', 'Mojang, please add hats for axolotls', 'Did you know I can play dead?',
]

export function mountPet(container, settings, saveSettings) {
  let color = settings.petColor
  if (!COLORS[color]) {
    // как в игре: синий выпадает с шансом 1 к 1200
    color = Math.random() < 1 / 1200 ? 'blue' : COMMON[Math.floor(Math.random() * COMMON.length)]
    saveSettings({ petColor: color })
  }
  if (color === 'blue') unlock('blue_axolotl')
  let clicks = 0
  container.innerHTML = `<div class="pet" data-tip="${t('Ваш аксолотль')}">${axolotlSVG(color)}</div>`
  const pet = container.firstElementChild
  // моргание
  const blinker = setInterval(() => {
    if (!pet.isConnected) return clearInterval(blinker)
    pet.innerHTML = axolotlSVG(color, true)
    setTimeout(() => { if (pet.isConnected) pet.innerHTML = axolotlSVG(color) }, 160)
  }, 4200)
  pet.onclick = () => {
    clicks++
    sound('pop')
    pet.classList.remove('jump'); void pet.offsetWidth; pet.classList.add('jump')
    if (clicks === 50) unlock('pet_lover')
    document.querySelector('.pet-bubble')?.remove()
    const b = document.createElement('div')
    b.className = 'pet-bubble'
    const lines = pick(PET_LINES_RU, PET_LINES_EN)
    b.textContent = clicks === 50 ? t('Ты лучший друг аксолотля!') : lines[Math.floor(Math.random() * lines.length)]
    document.body.append(b)
    const r = pet.getBoundingClientRect()
    b.style.left = r.right + 10 + 'px'
    b.style.top = r.top + 4 + 'px'
    setTimeout(() => b.remove(), 2200)
  }
}

// ---------- конфетти и конами ----------
export function confetti(n = 40) {
  const colors = Object.keys(COLORS)
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div')
    el.className = 'confetti'
    el.innerHTML = axolotlSVG(colors[i % colors.length])
    el.style.left = Math.random() * 100 + 'vw'
    el.style.animationDuration = 2.5 + Math.random() * 3 + 's'
    el.style.animationDelay = Math.random() * 1.5 + 's'
    el.style.width = 18 + Math.random() * 24 + 'px'
    document.body.append(el)
    setTimeout(() => el.remove(), 8000)
  }
}

export function setupKonami() {
  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  let pos = 0
  document.addEventListener('keydown', e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    pos = k === code[pos] ? pos + 1 : (k === code[0] ? 1 : 0)
    if (pos === code.length) {
      pos = 0
      unlock('konami')
      confetti(60)
      document.body.classList.add('party')
      toast(t('ВЕЧЕРИНКА АКСОЛОТЛЕЙ!'), t('Режим радуги на 10 секунд'), 'success', 'party')
      setTimeout(() => document.body.classList.remove('party'), 10000)
    }
  })
}

export function greeting(name) {
  const h = new Date().getHours()
  const part = h < 5 ? t('Доброй ночи') : h < 12 ? t('Доброе утро') : h < 18 ? t('Добрый день') : t('Добрый вечер')
  return `${part}${name ? ', ' + name : ''}!`
}

// ---------- иконки для сборок (вместо эмодзи) ----------
export const INST_ICONS = ['pickaxe', 'sword', 'flame', 'gem', 'tree', 'mountain', 'castle', 'rocket', 'flask', 'flower', 'gamepad', 'zap',
  'waves', 'snowflake', 'moon', 'planet', 'bug', 'skull', 'crown', 'star', 'leaf', 'fish', 'ghost', 'heart', 'box', 'bomb', 'eye', 'settings']
