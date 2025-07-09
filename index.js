const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

async function connectToDB() {
  try {
    await client.connect();
    db = client.db("eduManage");

    // Create indexes
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("teacherRequests").createIndex({ userId: 1 });
    await db.collection("classes").createIndex({ teacherId: 1 });
    await db.collection("enrollments").createIndex({ studentId: 1 });
    await db.collection("assignments").createIndex({ classId: 1 });
    await db.collection("submissions").createIndex({ assignmentId: 1, studentId: 1 });
    await db.collection("feedback").createIndex({ classId: 1 });
    console.log("✅ Connected to MongoDB and indexes created");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}
connectToDB();

// --- USERS ---
// Create user
app.post("/users", async (req, res) => {
  try {
    const newUser = req.body;
    const result = await db.collection("users").insertOne(newUser);
    res.status(201).send(result);
  } catch (err) {
    if (err.code === 11000) return res.status(400).send({ error: "Email already exists" });
    res.status(500).send({ error: "Failed to create user" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const search = req.query.search || "";
    const regex = new RegExp(search, "i");

    const users = await db.collection("users").find({
      $or: [
        { name: { $regex: regex } },
        { email: { $regex: regex } }
      ]
    }).toArray();

    console.log("Sending users:", users.length);
    res.send(users);
  } catch (err) {
    console.error("Failed to get users:", err);
    res.status(500).send({ error: "Failed to fetch users" });
  }
});




// Get user by email
app.get("/users/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await db.collection("users").findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });
    res.send(user);
  } catch (err) {
    res.status(500).send({ error: "Failed to get user" });
  }
});

// Update user by ID
app.patch("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const result = await db
      .collection("users")
      .updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
    if (result.matchedCount === 0) return res.status(404).send({ error: "User not found" });
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to update user" });
  }
});

// update user role
app.patch("/users/role/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const newRole = req.body.role;

    if (!newRole) {
      return res.status(400).send({ error: "Role is required in request body." });
    }

    const result = await db
      .collection("users")
      .updateOne(
        { email },
        { $set: { role: newRole } }
      );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ error: "User not found or role not changed." });
    }

    res.send({ success: true, message: `Role updated to ${newRole}` });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).send({ error: "Failed to update user role" });
  }
});


// --- TEACHER REQUESTS ---
// Create teacher request
app.post("/teacherRequests", async (req, res) => {
  try {
    const request = req.body;
    request.status = "pending";
    request.submittedAt = new Date();
    const result = await db.collection("teacherRequests").insertOne(request);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to create teacher request" });
  }
});

// Get all teacher requests (admin)
app.get("/teacherRequests", async (req, res) => {
  try {
    const requests = await db.collection("teacherRequests").find().toArray();
    res.send(requests);
  } catch (err) {
    res.status(500).send({ error: "Failed to get teacher requests" });
  }
});

// Update teacher request status
app.patch("/teacherRequests/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; // expected: "accepted" or "rejected" or "pending"
    const result = await db
      .collection("teacherRequests")
      .updateOne({ _id: new ObjectId(id) }, { $set: { status, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).send({ error: "Request not found" });
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to update teacher request" });
  }
});

// --- CLASSES ---
// Create class (teacher adds class)
app.post("/classes", async (req, res) => {
  try {
    const newClass = req.body;
    newClass.status = "pending";
    newClass.totalEnrollment = 0;
    newClass.createdAt = new Date();
    const result = await db.collection("classes").insertOne(newClass);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to create class" });
  }
});

// Get all approved classes (for all users)
app.get("/classes", async (req, res) => {
  try {
    const classes = await db.collection("classes").find({ status: "approved" }).toArray();
    res.send(classes);
  } catch (err) {
    res.status(500).send({ error: "Failed to get classes" });
  }
});

// Get class by ID
app.get("/classes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const classObj = await db.collection("classes").findOne({ _id: new ObjectId(id) });
    if (!classObj) return res.status(404).send({ error: "Class not found" });
    res.send(classObj);
  } catch (err) {
    res.status(500).send({ error: "Failed to get class" });
  }
});

// Update class status (admin approves/rejects)
app.patch("/classes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body; // e.g., { status: "approved" }
    updatedData.updatedAt = new Date();
    const result = await db
      .collection("classes")
      .updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
    if (result.matchedCount === 0) return res.status(404).send({ error: "Class not found" });
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to update class" });
  }
});

// Delete class by ID (teacher)
app.delete("/classes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.collection("classes").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).send({ error: "Class not found" });
    res.send({ message: "Class deleted" });
  } catch (err) {
    res.status(500).send({ error: "Failed to delete class" });
  }
});

// --- ENROLLMENTS ---
// Enroll in class (student)
app.post("/enrollments", async (req, res) => {
  try {
    const enrollment = req.body;
    enrollment.enrolledAt = new Date();
    enrollment.paymentStatus = "paid"; // for simplicity, assume paid
    const result = await db.collection("enrollments").insertOne(enrollment);

    // Update class enrollment count
    await db
      .collection("classes")
      .updateOne(
        { _id: new ObjectId(enrollment.classId) },
        { $inc: { totalEnrollment: 1 } }
      );

    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to enroll" });
  }
});

// Get enrollments by studentId
app.get("/enrollments/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const enrollments = await db
      .collection("enrollments")
      .find({ studentId: new ObjectId(studentId) })
      .toArray();
    res.send(enrollments);
  } catch (err) {
    res.status(500).send({ error: "Failed to get enrollments" });
  }
});

// --- ASSIGNMENTS ---
// Add assignment to class (teacher)
app.post("/assignments", async (req, res) => {
  try {
    const assignment = req.body;
    assignment.createdAt = new Date();
    assignment.submissionCount = 0;
    const result = await db.collection("assignments").insertOne(assignment);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to create assignment" });
  }
});

// Get assignments by classId
app.get("/assignments/:classId", async (req, res) => {
  try {
    const classId = req.params.classId;
    const assignments = await db
      .collection("assignments")
      .find({ classId: new ObjectId(classId) })
      .toArray();
    res.send(assignments);
  } catch (err) {
    res.status(500).send({ error: "Failed to get assignments" });
  }
});

// --- SUBMISSIONS ---
// Submit assignment (student)
app.post("/submissions", async (req, res) => {
  try {
    const submission = req.body;
    submission.submittedAt = new Date();

    // Insert submission
    const result = await db.collection("submissions").insertOne(submission);

    // Increment assignment submissionCount
    await db
      .collection("assignments")
      .updateOne(
        { _id: new ObjectId(submission.assignmentId) },
        { $inc: { submissionCount: 1 } }
      );

    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to submit assignment" });
  }
});

// Get submissions by studentId and assignmentId
app.get("/submissions", async (req, res) => {
  try {
    const { studentId, assignmentId } = req.query;
    const query = {};
    if (studentId) query.studentId = new ObjectId(studentId);
    if (assignmentId) query.assignmentId = new ObjectId(assignmentId);

    const submissions = await db.collection("submissions").find(query).toArray();
    res.send(submissions);
  } catch (err) {
    res.status(500).send({ error: "Failed to get submissions" });
  }
});

// --- FEEDBACK ---
// Submit feedback (student)
app.post("/feedback", async (req, res) => {
  try {
    const feedback = req.body;
    feedback.createdAt = new Date();
    const result = await db.collection("feedback").insertOne(feedback);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to submit feedback" });
  }
});

// Get all feedback
app.get("/feedback", async (req, res) => {
  try {
    const feedbacks = await db.collection("feedback").find().toArray();
    res.send(feedbacks);
  } catch (err) {
    res.status(500).send({ error: "Failed to get feedback" });
  }
});

// --- PARTNERS ---
// Add partner (admin)
app.post("/partners", async (req, res) => {
  try {
    const partner = req.body;
    const result = await db.collection("partners").insertOne(partner);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to add partner" });
  }
});

// Get all partners
app.get("/partners", async (req, res) => {
  try {
    const partners = await db.collection("partners").find().toArray();
    res.send(partners);
  } catch (err) {
    res.status(500).send({ error: "Failed to get partners" });
  }
});

// --- SERVER START ---
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
