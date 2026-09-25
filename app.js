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
app.get('/product', (req, res) => {
    getProduct(req.query.id, (err, product) => {
        res.render('product', { product: product });
    });
  
});
app.get('/searchproducts', (req, res) => {
    Search(req.query.search, (err, result) => {
        res.status(200).send(JSON.stringify(result));
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
function getProduct(id, callback) {
    connection.query('SELECT * FROM products WHERE idproducts = ?', [id], (err, results) => {
        if (err) {
            console.log('Error fetching products: ', err);
            callback(err, null);
        } 
        else {
            callback(null, results);
        }
    });
}
function Search (text, callback) {
    text += '%';
    let sql = 'SELECT * FROM products WHERE name LIKE ?';
    connection.query(sql, text, (err, result) => {
        if (err) {
            console.log(err);
        }
        else {
            let text2 = '%' + text;
            let sql2 = 'SELECT * FROM products WHERE name LIKE ? AND name NOT LIKE "'+text+'"';
            connection.query(sql2, text2, (err, result2) => {
                if (err) {
                    console.log(err);
                }
                else {
                    result = result.concat(result2);
                    callback(err, result);
                }
            });
        }
    });
}