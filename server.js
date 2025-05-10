const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const path = require("path");
const nodemailer = require("nodemailer");
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); 

// MongoDB connection
mongoose
  .connect("mongodb://127.0.0.1:27017/mar_transport", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", UserSchema);

const BookingSchema = new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  passengers: Number,
  seatType: String,
  email: String,
  passengerDetails: Array,
});
const Booking = mongoose.model("Booking", BookingSchema);

const BookedSeatSchema = new mongoose.Schema({
  seatNumber: String,
  busId: String,
  date: String,
  bookedAt: { type: Date, default: Date.now, expires: '30d' }, // expire after 30 days
});
const BookedSeat = mongoose.model("BookedSeat", BookedSeatSchema);
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ error: "Username or email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid password" });

    res.json({ message: "Login successful" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/book", async (req, res) => {
  try {
    const bookingData = new Booking(req.body);
    await bookingData.save();
    res.status(201).json({ message: "passenger details stored to database", booking: bookingData });
  } catch (error) {
    res.status(500).json({ message: "Error saving booking", error });
  }
});
app.get("/booked-seats", async (req, res) => {
  const { busId, date } = req.query;
  const booked = await BookedSeat.find({ busId, date });
  const seatNumbers = booked.map(s => s.seatNumber);
  res.json({ bookedSeats: seatNumbers });
});

app.post("/book-seat", async (req, res) => {
    const { busId, date, seats, email } = req.body;

    if (!busId || !date || !seats || seats.length === 0 || !email) {
        return res.status(400).json({ message: "Missing required fields: busId, date, seats, or email." });
    }

    try {
        const existing = await BookedSeat.find({
            busId,
            date,
            seatNumber: { $in: seats.map(String) }
        });

        if (existing.length > 0) {
            return res.status(400).json({ message: "Some seats are already booked." });
        }
        const newBookings = seats.map(seat => ({
            busId,
            date,
            seatNumber: seat.toString()
        }));

        await BookedSeat.insertMany(newBookings);

       
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "ashvanth932006@gmail.com",          // Your Gmail
                pass: "kotn dnou gigp ttus"                // App Password (not your actual Gmail password)
            }
        });

       
        const mailOptions = {
            from: "ashvanth932006@gmail.com",
            to: email,
            subject: "Booking Confirmation ✔",
            html: `
                <div style="font-family:sans-serif; color:#333;">
                    <h2 style="color:#0ef;">Booking Confirmed</h2>
                    <p><strong>Bus ID:</strong> ${busId}</p>
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Seats:</strong> ${seats.join(", ")}</p>
                    <br/>
                    <p>Thank you for booking with us!</p>
                    <hr/>
                    <small>This is an automated message. Please do not reply.</small>
                </div>
            `
        };

        
        await transporter.sendMail(mailOptions);
        console.log(`Confirmation email sent to: ${email}`);

        res.json({ message: "Seats booked and confirmation email sent!" });

    } catch (err) {
        console.error("Booking error:", err);
        res.status(500).json({ message: "Booking failed. Try again later." });
    }
});

app.post("/cancel-seat", async (req, res) => {
  const { busId, seatNo, date, email } = req.body;

  try {
     
      const deleted = await BookedSeat.findOneAndDelete({
          busId: busId,
          date: date,
          seatNumber: seatNo
      });

      if (deleted) {
          
          const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                  user: "ashvanth932006@gmail.com",
                  pass: "kotn dnou gigp ttus" // Use your App Password
              }
          });

          const mailOptions = {
              from: "ashvanth932006@gmail.com",
              to: email,
              subject: "Ticket Cancellation Confirmation",
              html: `
                  <div style="font-family: sans-serif; color: #333;">
                      <h2 style="color: red;">Ticket Cancelled</h2>
                      <p><strong>Bus ID:</strong> ${busId}</p>
                      <p><strong>Date:</strong> ${date}</p>
                      <p><strong>Cancelled Seat Number:</strong> ${seatNo}</p>
                      <br/>
                      <p>We're sorry to see you cancel. Hope to serve you again soon!</p>
                      <hr/>
                      <small>This is an automated message. Please do not reply.</small>
                  </div>
              `
          };

          await transporter.sendMail(mailOptions);
          console.log(`Cancellation email sent to: ${email}`);

          res.json({ message: "Ticket cancelled and email sent!" });
      } else {
          res.status(404).json({ message: "Ticket not found." });
      }
  } catch (error) {
      console.error("Cancellation error:", error);
      res.status(500).json({ message: "Error cancelling ticket." });
  }
});
app.post('/contact', async (req, res) => {
  try {
      const { name, email, message } = req.body;
      const newContact = new Contact({ name, email, message });
      await newContact.save();
      res.status(200).json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
  }
});
app.get('/get-latest-ticket', async (req, res) => {
  try {
    // Get latest Booking
    const latestBooking = await Booking.findOne().sort({ _id: -1 });

    // Get latest Booked Seat
    const latestBookedSeat = await BookedSeat.findOne().sort({ _id: -1 });

    if (!latestBooking || !latestBookedSeat) {
      return res.status(404).json({ message: 'No booking data found' });
    }

    // Extract latest passenger details
    const passenger = latestBooking.passengerDetails[latestBooking.passengerDetails.length - 1];

    const ticketData = {
      name: passenger.name,
      age: passenger.age,
      sex: passenger.sex,
      email: latestBooking.email,
      date: latestBooking.date,
      from: latestBooking.from,
      to: latestBooking.to,
      seatType: latestBooking.seatType,
      busId: latestBookedSeat.busId,
      seatNo: latestBookedSeat.seatNumber,
      price: "850", // or fetch from your pricing logic
    };

    res.json(ticketData);
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ message: 'Failed to load ticket' });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "loginpage.html"));
});

app.listen(1000, () => console.log("Server running on http://localhost:1000"));
