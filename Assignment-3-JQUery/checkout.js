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

    
    const isValid = validateForm();

    if (isValid) {
      
      alert('Form submitted successfully!');
    } else {
      const firstInvalid = $('.form-control.is-invalid, .form-select.is-invalid').first();
      if (firstInvalid.length) {
        $('html, body').animate({
          scrollTop: firstInvalid.offset().top - 100
        }, 500);
      }
    }
  });


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
