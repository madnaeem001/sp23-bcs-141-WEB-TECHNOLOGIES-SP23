$(document).ready(function() {
  
  
  $('input[name="paymentMethod"]').on('change', function() {
    if ($(this).val() === 'card') {
      $('#cardFields').removeClass('d-none');
    } else {
      $('#cardFields').addClass('d-none');
      
      $('#cardFields .form-control').removeClass('is-invalid is-valid');
    }
  });

  
  $('#fullName, #email, #phone, #address, #city, #postalCode, #country, #cardName, #cardNumber, #cardExpiry, #cardCVV').on('blur', function() {
    validateField($(this));
  });


  $('#checkoutForm').on('submit', function(e) {
    e.preventDefault();

    // Client-side validation first
    const isValid = validateForm();

    if (isValid) {
      submitOrder();
    } else {
      const firstInvalid = $('.form-control.is-invalid, .form-select.is-invalid').first();
      if (firstInvalid.length) {
        $('html, body').animate({
          scrollTop: firstInvalid.offset().top - 100
        }, 500);
      }
    }
  });

  // Submit order with server-side validation
  async function submitOrder() {
    try {
      // Show loading state
      const submitBtn = $('#checkoutForm button[type="submit"]');
      const originalText = submitBtn.text();
      submitBtn.prop('disabled', true).text('Processing...');

      // Get cart from localStorage or session
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      
      if (cart.length === 0) {
        alert('Your cart is empty. Please add items before checkout.');
        return;
      }

      // Validate cart first
      const cartValidation = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart })
      });

      const cartResult = await cartValidation.json();
      
      if (cartResult.hasChanges) {
        let message = 'Your cart has been updated:\n';
        if (cartResult.removedItems.length > 0) {
          message += `\nRemoved items:\n${cartResult.removedItems.map(item => `- ${item.name}: ${item.reason}`).join('\n')}`;
        }
        if (cartResult.updatedItems.length > 0) {
          message += `\nPrice updates:\n${cartResult.updatedItems.map(item => `- ${item.name}: $${item.oldPrice} → $${item.newPrice}`).join('\n')}`;
        }
        message += '\n\nPlease review your cart and try again.';
        
        alert(message);
        
        // Update localStorage with validated cart
        localStorage.setItem('cart', JSON.stringify(cartResult.validatedCart));
        location.reload(); // Refresh to show updated cart
        return;
      }

      // Collect form data
      const formData = {
        customerName: $('#fullName').val().trim(),
        email: $('#email').val().trim(),
        phone: $('#phone').val().trim(),
        address: $('#address').val().trim(),
        city: $('#city').val().trim(),
        postalCode: $('#postalCode').val().trim(),
        country: $('#country').val(),
        paymentMethod: $('input[name="paymentMethod"]:checked').val(),
        items: cartResult.validatedCart,
        totalAmount: cartResult.recalculatedTotal
      };

      // Add card details if card payment selected
      if (formData.paymentMethod === 'card') {
        formData.cardName = $('#cardName').val().trim();
        formData.cardNumber = $('#cardNumber').val().replace(/\s/g, '');
        formData.cardExpiry = $('#cardExpiry').val();
        formData.cardCVV = $('#cardCVV').val();
      }

      // Submit order
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        // Clear cart and redirect to confirmation
        localStorage.removeItem('cart');
        alert('Order submitted successfully!');
        window.location.href = `/order-confirmation/${result.orderId}`;
      } else {
        // Show server validation errors
        if (result.details && Array.isArray(result.details)) {
          alert('Validation errors:\n' + result.details.join('\n'));
        } else {
          alert(result.error || 'Failed to submit order');
        }
      }
    } catch (error) {
      console.error('Order submission error:', error);
      alert('Network error. Please try again.');
    } finally {
      // Restore button state
      const submitBtn = $('#checkoutForm button[type="submit"]');
      submitBtn.prop('disabled', false).text('Submit Order');
    }
  }


  function validateForm() {
    let isValid = true;

   
    $('#fullName').val().trim().length < 3 ? markInvalid($('#fullName')) : markValid($('#fullName'));
    if ($('#fullName').val().trim().length < 3) isValid = false;

    validateEmail($('#email')) ? markValid($('#email')) : (markInvalid($('#email')), isValid = false);

    validatePhone($('#phone')) ? markValid($('#phone')) : (markInvalid($('#phone')), isValid = false);

    $('#address').val().trim().length === 0 ? (markInvalid($('#address')), isValid = false) : markValid($('#address'));

    $('#city').val().trim().length === 0 ? (markInvalid($('#city')), isValid = false) : markValid($('#city'));

    validatePostalCode($('#postalCode')) ? markValid($('#postalCode')) : (markInvalid($('#postalCode')), isValid = false);

    $('#country').val() === '' ? (markInvalid($('#country')), isValid = false) : markValid($('#country'));

   
    if ($('input[name="paymentMethod"]:checked').length === 0) {
      $('.invalid-feedback').eq(5).show(); 
      isValid = false;
    } else {
      $('.invalid-feedback').eq(5).hide();
    }

   
    if ($('#cardPayment').is(':checked')) {
      if ($('#cardName').val().trim().length === 0) {
        markInvalid($('#cardName'));
        isValid = false;
      } else {
        markValid($('#cardName'));
      }

      if (!validateCardNumber($('#cardNumber').val())) {
        markInvalid($('#cardNumber'));
        isValid = false;
      } else {
        markValid($('#cardNumber'));
      }

      if (!validateExpiry($('#cardExpiry').val())) {
        markInvalid($('#cardExpiry'));
        isValid = false;
      } else {
        markValid($('#cardExpiry'));
      }

      if (!validateCVV($('#cardCVV').val())) {
        markInvalid($('#cardCVV'));
        isValid = false;
      } else {
        markValid($('#cardCVV'));
      }
    }


    if (!$('#termsCheckbox').is(':checked')) {
      markInvalid($('#termsCheckbox'));
      isValid = false;
    } else {
      markValid($('#termsCheckbox'));
    }

    return isValid;
  }

  
  function validateField($field) {
    const fieldId = $field.attr('id');

    switch(fieldId) {
      case 'fullName':
        $field.val().trim().length >= 3 ? markValid($field) : markInvalid($field);
        break;
      case 'email':
        validateEmail($field) ? markValid($field) : markInvalid($field);
        break;
      case 'phone':
        validatePhone($field) ? markValid($field) : markInvalid($field);
        break;
      case 'address':
        $field.val().trim().length > 0 ? markValid($field) : markInvalid($field);
        break;
      case 'city':
        $field.val().trim().length > 0 ? markValid($field) : markInvalid($field);
        break;
      case 'postalCode':
        validatePostalCode($field) ? markValid($field) : markInvalid($field);
        break;
      case 'country':
        $field.val() !== '' ? markValid($field) : markInvalid($field);
        break;
      case 'cardName':
        $field.val().trim().length > 0 ? markValid($field) : markInvalid($field);
        break;
      case 'cardNumber':
        validateCardNumber($field.val()) ? markValid($field) : markInvalid($field);
        break;
      case 'cardExpiry':
        validateExpiry($field.val()) ? markValid($field) : markInvalid($field);
        break;
      case 'cardCVV':
        validateCVV($field.val()) ? markValid($field) : markInvalid($field);
        break;
    }
  }

  
  function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test($(email).val());
  }

  function validatePhone(phone) {
    const regex = /^\d{10,}$/;
    return regex.test($(phone).val().replace(/\D/g, ''));
  }

  function validatePostalCode(code) {
    const regex = /^\d{4,6}$/;
    return regex.test($(code).val());
  }

  function validateCardNumber(card) {
    const regex = /^\d{16}$/;
    return regex.test(card.replace(/\s/g, ''));
  }

  function validateExpiry(expiry) {
    const regex = /^\d{2}\/\d{2}$/;
    return regex.test(expiry);
  }

  function validateCVV(cvv) {
    const regex = /^\d{3}$/;
    return regex.test(cvv);
  }

  
  function markValid($field) {
    $field.removeClass('is-invalid').addClass('is-valid');
  }

  
  function markInvalid($field) {
    $field.removeClass('is-valid').addClass('is-invalid');
  }
});
