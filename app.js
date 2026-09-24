const http = require('http');
const emitter = require('events');
const fs = require('fs');
const mysql = require('mysql2');
const express = require('express');
const { json } = require('stream/consumers');

var events = new emitter.EventEmitter();
const app= express();
app.set('view engine', 'ejs');
app.set('query parser', 'extended');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.render('index');
});
app.get('/products', (req, res) => {
    getAllProducts((err, products) => {
        res.render('productlist', { products: products });
    });
  
});
app.get('/about', (req, res) => {
  res.render('about');
});
app.use((req, res) => {
    res.status(404).send('<p>404 Page not found</p>');
});

app.listen(3000, ()=> {
    console.log('Listening on port 3000...');
});
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'eithriela',
    password: 'h530n730',
    database: 'magma',
    multipleStatements: true
}); 
connection.connect((err) => {
    if (err) {
        console.log('Failed to connect. Err: ', err);
    }
    else {
        console.log('Connected to DB. ID: ', connection.threadId);

    }
});

//FUNCTIONS
function getAllProducts(callback) {
    connection.query('SELECT * FROM products', (err, results) => {
        if (err) {
            console.log('Error fetching products: ', err);
            callback(err, null);
        } 
        else {
            callback(null, results);
        }
    });
}
