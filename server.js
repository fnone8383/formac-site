/**
 * ============================================================================
 * FORMAC FORMAÇÃO — SERVIDOR COMPLETO (site + auth + checkout NexusPag)
 * ============================================================================
 * Este processo único Node:
 *   1) Serve o site (pasta /public)
 *   2) Autentica alunos e admin de verdade (senha com hash bcrypt, sessão
 *      via cookie httpOnly assinado com JWT — nada de senha visível no
 *      código-fonte da página, como acontecia na versão anterior)
 *   3) Guarda alunos, matrículas e pedidos no MongoDB (persiste de verdade,
 *      ao contrário do armazenamento anterior que só existia dentro do
 *      ambiente de artefato da Claude)
 *   4) Cria cobranças Pix reais na NexusPag e libera o curso automaticamente
 *      quando o webhook confirma o pagamento
 *   5) Nunca confia no preço que vem do navegador — sempre confere o valor
 *      oficial em data/courses.js antes de cobrar
 *
 * VARIÁVEIS DE AMBIENTE NECESSÁRIAS (ver .env.example):
 *   MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH,
 *   NEXUSPAG_SECRET_KEY, NEXUSPAG_WEBHOOK_SECRET, NEXUSPAG_API_BASE_URL,
 *   NEXUSPAG_SHOP_ID, COOKIE_SECURE, PORT
 * ============================================================================
 */

require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const User = require("./models/User");
const Order = require("./models/Order");
const COURSES = require("./data/courses");

const app = express();
app.set("trust proxy", 1); // necessário no Render/Railway para IP real e cookies "secure" funcionarem

/* ============================================================================
   CONFIGURAÇÃO
   ============================================================================ */
const {
  MONGODB_URI,
  JWT_SECRET,
  ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH,
  NEXUSPAG_API_BASE_URL = "https://nexuspag.com",
  NEXUSPAG_SECRET_KEY,
  NEXUSPAG_WEBHOOK_SECRET,
  NEXUSPAG_SHOP_ID = "jorgeluisvieiraenes14@gmail.com",
  COOKIE_SECURE = "true",
  PORT = 3000
} = process.env;

const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "NEXUSPAG_SECRET_KEY", "NEXUSPAG_WEBHOOK_SECRET"];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`⚠️  Faltam variáveis de ambiente obrigatórias: ${missing.join(", ")}`);
  console.error("   O servidor vai subir, mas as rotas que dependem delas vão falhar.");
}

/* ============================================================================
   BANCO DE DADOS (MongoDB Atlas — free tier permanente)
   ============================================================================ */
mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Conectado ao MongoDB"))
  .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err.message));

/* ============================================================================
   SEGURANÇA GERAL
   ============================================================================ */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login/cadastro. Aguarde alguns minutos." }
});
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
});
app.use(["/api/auth/login", "/api/auth/register"], authLimiter);
app.use("/api/checkout/create-charge", checkoutLimiter);

// JSON normal em tudo, EXCETO o webhook (precisa do corpo bruto para HMAC)
app.use((req, res, next) => {
  if (req.originalUrl === "/api/checkout/webhook") return next();
  express.json()(req, res, next);
});
app.use("/api/checkout/webhook", express.raw({ type: "*/*" }));

app.use(express.static(path.join(__dirname, "public")));

const nexusPagClient = axios.create({
  baseURL: NEXUSPAG_API_BASE_URL,
  headers: { "x-api-key": NEXUSPAG_SECRET_KEY, "Content-Type": "application/json" },
  timeout: 10000
});

/* ============================================================================
   AUTENTICAÇÃO — JWT em cookie httpOnly (não acessível via JavaScript do
   navegador, então não pode ser roubado por um ataque simples de XSS)
   ============================================================================ */
const COOKIE_NAME = "formac_session";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: COOKIE_SECURE !== "false", // true em produção (HTTPS); desative só se testar sem HTTPS local
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
};

function issueSession(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
}

function authRequired(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Não autenticado." });
  try {
    req.session = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
    return res.status(401).json({ error: "Sessão expirada, faça login novamente." });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!req.session.isAdmin) return res.status(403).json({ error: "Acesso restrito ao administrador." });
    next();
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ----------------------------------------------------------------------
   Cadastro de aluno
   ---------------------------------------------------------------------- */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, cpf, email, phone, password } = req.body;
    if (!name || !email || !password || password.length < 6 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Dados inválidos. Confira nome, e-mail e senha (mín. 6 caracteres)." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Já existe uma conta com este e-mail." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, cpf, email: email.toLowerCase(), phone, passwordHash });

    issueSession(res, { userId: user._id.toString(), email: user.email, isAdmin: false });
    res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    console.error("Erro no cadastro:", err.message);
    res.status(500).json({ error: "Erro ao criar conta. Tente novamente." });
  }
});

/* ----------------------------------------------------------------------
   Login — aluno OU admin (admin verificado contra hash no .env, nunca
   um usuário comum no banco)
   ---------------------------------------------------------------------- */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha." });
    const emailLower = email.toLowerCase();

    if (emailLower === (ADMIN_EMAIL || "").toLowerCase()) {
      const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH || "");
      if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });
      issueSession(res, { isAdmin: true, email: emailLower });
      return res.json({ user: { name: "Administrador", email: emailLower, isAdmin: true } });
    }

    const user = await User.findOne({ email: emailLower });
    if (!user) return res.status(401).json({ error: "E-mail ou senha inválidos." });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });

    issueSession(res, { userId: user._id.toString(), email: user.email, isAdmin: false });
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    console.error("Erro no login:", err.message);
    res.status(500).json({ error: "Erro ao entrar. Tente novamente." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  if (req.session.isAdmin) {
    return res.json({ user: { name: "Administrador", email: req.session.email, isAdmin: true } });
  }
  const user = await User.findById(req.session.userId);
  if (!user) return res.status(401).json({ error: "Usuário não encontrado." });
  res.json({ user: user.toSafeJSON() });
});

/* ============================================================================
   CHECKOUT — criar cobrança PIX na NexusPag
   ============================================================================ */
app.post("/api/checkout/create-charge", authRequired, async (req, res) => {
  try {
    if (req.session.isAdmin) return res.status(400).json({ error: "Login de administrador não pode comprar cursos." });

    const { courseId } = req.body;
    const course = COURSES[courseId];
    if (!course) return res.status(400).json({ error: "Curso inválido." });

    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ error: "Usuário não encontrado." });

    if (user.enrollments.some(e => e.courseId === courseId)) {
      return res.status(409).json({ error: "Você já está matriculado neste curso." });
    }

    const orderId = "PED-" + crypto.randomBytes(6).toString("hex").toUpperCase();

    // amount vem SEMPRE da lista oficial do servidor — nunca do navegador.
    const nexusResponse = await nexusPagClient.post("/api/pix/create", {
      amount: course.price,
      description: `Matricula - ${course.name} - FORMAC Formacao`.slice(0, 140),
      external_id: orderId,
      webhook_url: `${req.protocol}://${req.get("host")}/api/checkout/webhook`,
      expiration: 15 * 60,
      shop_id: NEXUSPAG_SHOP_ID
    });

    const charge = nexusResponse.data?.transaction;
    if (!nexusResponse.data?.success || !charge) {
      throw new Error("Resposta inesperada da NexusPag ao criar cobrança.");
    }

    await Order.create({
      id: orderId,
      courseId,
      courseName: course.name,
      amount: course.price,
      studentEmail: user.email,
      studentName: user.name,
      status: "pending",
      chargeId: charge.id,
      txid: charge.txid,
      pixCode: charge.pix_copia_cola,
      expiresAt: charge.expires_at
    });

    res.json({
      id: charge.id,
      orderId,
      status: "pending",
      pix: { qrcode: charge.pix_copia_cola, qrcode_base64: charge.qr_code_base64 },
      expires_at: charge.expires_at,
      amount: course.price
    });
  } catch (err) {
    console.error("Erro ao criar cobrança NexusPag:", err?.response?.data || err.message);
    res.status(502).json({ error: "Falha ao criar cobrança na NexusPag." });
  }
});

app.get("/api/checkout/status/:chargeId", authRequired, async (req, res) => {
  const order = await Order.findOne({ chargeId: req.params.chargeId });
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  res.json({ id: order.chargeId, status: order.status });
});

/* ----------------------------------------------------------------------
   WEBHOOK NexusPag — confirma pagamento e libera o curso automaticamente
   ---------------------------------------------------------------------- */
app.post("/api/checkout/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-nexuspag-signature"];
    const timestamp = req.headers["x-nexuspag-timestamp"];
    if (!signature || !timestamp) return res.status(401).send("Assinatura ausente");

    const parsedBody = JSON.parse(req.body.toString("utf8"));
    const payloadForSignature = JSON.stringify(parsedBody);
    const expected = crypto.createHmac("sha256", NEXUSPAG_WEBHOOK_SECRET)
      .update(`${timestamp}.${payloadForSignature}`)
      .digest("hex");

    if (signature !== expected) return res.status(401).send("Assinatura inválida");

    const event = parsedBody.event;
    const chargeId = parsedBody.data?.id;
    const externalId = parsedBody.data?.external_id;

    const order = await Order.findOne(externalId ? { id: externalId } : { chargeId });
    if (!order) return res.status(200).send("ok");

    if (event === "payment.confirmed" && order.status === "pending") {
      order.status = "paid";
      order.paidAt = new Date();
      await order.save();
      await liberarAcessoAoCurso(order);
    } else if (event === "payment.expired" && order.status === "pending") {
      order.status = "expired";
      await order.save();
    } else if ((event === "payment.failed" || event === "payment.refused") && order.status === "pending") {
      order.status = "refused";
      await order.save();
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("Erro ao processar webhook NexusPag:", err.message);
    res.status(400).send("Erro ao processar webhook");
  }
});

async function liberarAcessoAoCurso(order) {
  const user = await User.findOne({ email: order.studentEmail });
  if (!user) return console.warn("Webhook: aluno não encontrado para liberar curso:", order.studentEmail);
  if (user.enrollments.some(e => e.orderId === order.id)) return; // idempotência

  user.enrollments.push({
    id: crypto.randomBytes(8).toString("hex"),
    courseId: order.courseId,
    courseName: order.courseName,
    amount: order.amount,
    orderId: order.id,
    enrolledAt: new Date()
  });
  await user.save();
  console.log(`✅ Curso "${order.courseName}" liberado para ${order.studentEmail}.`);
  // Ponto para enviar e-mail de confirmação de matrícula, se desejar.
}

/* ============================================================================
   ÁREA DO ALUNO — progresso, certificado, avaliação
   ============================================================================ */
app.post("/api/enrollments/:enrollmentId/toggle-lesson", authRequired, async (req, res) => {
  if (req.session.isAdmin) return res.status(400).json({ error: "Login de administrador não tem matrículas." });
  const { lessonIndex } = req.body;
  const user = await User.findById(req.session.userId);
  const enrollment = user.enrollments.find(e => e.id === req.params.enrollmentId);
  if (!enrollment) return res.status(404).json({ error: "Matrícula não encontrada." });

  const key = String(lessonIndex);
  enrollment.progress.set(key, !enrollment.progress.get(key));

  const course = COURSES[enrollment.courseId];
  const doneCount = [...enrollment.progress.values()].filter(Boolean).length;
  if (course && doneCount >= course.lessons && !enrollment.completed) {
    enrollment.completed = true;
    enrollment.completedAt = new Date();
    enrollment.certificateIssued = true;
    enrollment.certificateCode = "FORMAC-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  }

  await user.save();
  res.json({ user: user.toSafeJSON() });
});

app.post("/api/enrollments/:enrollmentId/review", authRequired, async (req, res) => {
  if (req.session.isAdmin) return res.status(400).json({ error: "Login de administrador não tem matrículas." });
  const { rating, text } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Nota inválida." });

  const user = await User.findById(req.session.userId);
  const enrollment = user.enrollments.find(e => e.id === req.params.enrollmentId);
  if (!enrollment) return res.status(404).json({ error: "Matrícula não encontrada." });

  enrollment.rating = rating;
  enrollment.reviewText = (text || "").slice(0, 1000);
  await user.save();
  res.json({ user: user.toSafeJSON() });
});

/* ============================================================================
   PAINEL ADMINISTRATIVO — protegido por adminRequired
   ============================================================================ */
app.get("/api/admin/overview", adminRequired, async (req, res) => {
  const users = await User.find({}, "-passwordHash");
  const orders = await Order.find();
  const totalRevenue = orders.filter(o => o.status === "paid").reduce((a, o) => a + o.amount, 0);
  const totalEnrollments = users.reduce((a, u) => a + u.enrollments.length, 0);
  const totalCertificates = users.reduce((a, u) => a + u.enrollments.filter(e => e.certificateIssued).length, 0);
  res.json({ totalStudents: users.length, totalEnrollments, totalCertificates, totalRevenue });
});

app.get("/api/admin/students", adminRequired, async (req, res) => {
  const users = await User.find({}, "-passwordHash").sort({ createdAt: -1 });
  res.json({ students: users });
});

app.get("/api/admin/orders", adminRequired, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json({ orders });
});

app.get("/api/admin/certificates", adminRequired, async (req, res) => {
  const users = await User.find({ "enrollments.certificateIssued": true }, "-passwordHash");
  const certificates = [];
  users.forEach(u => {
    u.enrollments.filter(e => e.certificateIssued).forEach(e => {
      certificates.push({
        studentName: u.name, studentEmail: u.email, courseName: e.courseName,
        code: e.certificateCode, issuedAt: e.completedAt
      });
    });
  });
  certificates.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  res.json({ certificates });
});

app.listen(PORT, () => {
  console.log(`✅ FORMAC Formação rodando em http://localhost:${PORT}`);
});
