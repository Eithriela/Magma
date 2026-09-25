const SearchProducts = (text) => {
    if (text == '') {
        window.location.reload();
    }
    else {
        let url = 'http://localhost:3000/searchproducts?search='+text;
        const req = new XMLHttpRequest();
        req.open('GET', url);
        req.send();
        req.addEventListener('load', () => {
            let fields = JSON.parse(req.responseText);
            if(fields.length>0) {
                document.getElementById('product-list-wrapper').innerHTML = '';
                fields.forEach(element => {
                    document.getElementById('product-list-wrapper').innerHTML += `<button class="product" onclick="location.href='/product?id=${element.id}'">
                        <div class="product-label">
                            <img class="product-image" src="images/${element.pictureurl || 'NoImageAvailable.jpg'}">
                        </div>
                        <div class="product-content">
                            <h3>${element.name}</h3>
                            <div class="product-price">€ ${element.price}</div>
                        </div>
                    </button>`;
                });
            }
            else{
                document.getElementById('product-list-wrapper').innerHTML = '<p>No products found</p>';
            }
        });
    }
}